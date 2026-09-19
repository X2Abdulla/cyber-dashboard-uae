/**
 * ============================================================================
 *  POST /api/auth/login — تسجيل الدخول الآمن
 * ============================================================================
 *  طبقات الحماية المطبقة هنا:
 *   1) تحقق من مصدر الطلب (CSRF).
 *   2) حد معدّل لكل IP ولكل حساب (مقاومة القوة الغاشمة).
 *   3) التحقق من قفل الحساب المؤقت.
 *   4) مقارنة bcrypt ثابتة الزمن + مقارنة وهمية عند عدم وجود الحساب
 *      (لمنع هجمات التوقيت التي تكشف وجود الحسابات).
 *   5) قفل الحساب 15 دقيقة بعد 5 محاولات فاشلة.
 *   6) تسجيل كامل في سجل العمليات (نجاح/فشل/حظر).
 *   7) رسالة خطأ عامة لا تكشف أي جزء صحيح من بيانات الدخول.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ensureDbReady } from "@/db/bootstrap";
import { fail, handleUnknownError, ok, readJson } from "@/lib/api";
import { AUDIT_ACTIONS, writeAuditLog } from "@/lib/audit";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionCookie } from "@/lib/auth/session";
import { ROLE_LABELS, can, PERMISSIONS } from "@/lib/auth/rbac";
import {
  ACCOUNT_LOCK_MINUTES,
  LIMITS,
  MAX_FAILED_ATTEMPTS,
  rateLimit,
  resetRateLimit,
} from "@/lib/security/rate-limit";
import { extractIp, isTrustedOrigin } from "@/lib/security/request";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  username: z.string().trim().min(2, "اسم المستخدم قصير جداً.").max(64),
  password: z.string().min(1, "كلمة المرور مطلوبة.").max(200),
});

/** تجزئة وهمية تُستخدم لمعادلة زمن الاستجابة عند عدم وجود الحساب. */
const DUMMY_HASH = "$2a$12$C6UzMDM.H6dfI/f/IKcEeO7ZBpDLmVhPBwvTvYgS3YxGJlW8lZzQe";

export async function POST(request: Request) {
  try {
    await ensureDbReady();
    const headerList = new Headers(request.headers);
    const ip = extractIp(headerList);
    const userAgent = (headerList.get("user-agent") ?? "unknown").slice(0, 400);

    if (!isTrustedOrigin(request)) {
      await writeAuditLog({
        category: "auth",
        action: "CSRF_BLOCKED",
        description: "محاولة دخول مرفوضة لعدم تطابق مصدر الطلب",
        status: "blocked",
        ip,
        userAgent,
      });
      return fail("مصدر الطلب غير موثوق.", 403, "CSRF");
    }

    const ipLimiter = rateLimit(`login:ip:${ip}`, LIMITS.LOGIN_PER_IP.limit, LIMITS.LOGIN_PER_IP.windowMs);
    if (!ipLimiter.allowed) {
      await writeAuditLog({
        category: "auth",
        action: AUDIT_ACTIONS.RATE_LIMITED,
        description: "تجاوز حد محاولات تسجيل الدخول من هذا العنوان",
        status: "blocked",
        ip,
        userAgent,
      });
      return fail(`تم تجاوز عدد المحاولات المسموح. أعد المحاولة بعد ${ipLimiter.retryAfterSeconds} ثانية.`, 429, "RATE_LIMITED");
    }

    const body = await readJson<z.infer<typeof loginSchema>>(request);
    if (body.error) return fail(body.error, 400);
    const parsed = loginSchema.safeParse(body.data);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "بيانات الدخول غير صالحة.", 400);

    const identifier = parsed.data.username.toLowerCase();
    const accountLimiter = rateLimit(
      `login:account:${identifier}`,
      LIMITS.LOGIN_PER_ACCOUNT.limit,
      LIMITS.LOGIN_PER_ACCOUNT.windowMs,
    );
    if (!accountLimiter.allowed) {
      await writeAuditLog({
        category: "auth",
        action: AUDIT_ACTIONS.LOGIN_LOCKED,
        description: `محاولات دخول مفرطة على الحساب ${identifier}`,
        status: "blocked",
        ip,
        userAgent,
      });
      return fail(`الحساب مقفل مؤقتاً بسبب كثرة المحاولات. حاول بعد ${accountLimiter.retryAfterSeconds} ثانية.`, 423, "LOCKED");
    }

    const rows = await db
      .select()
      .from(users)
      .where(eq(users.username, identifier))
      .limit(1);
    let user = rows[0];

    // دعم الدخول بالبريد الإلكتروني أيضاً.
    if (!user && identifier.includes("@")) {
      const byEmail = await db.select().from(users).where(eq(users.email, identifier)).limit(1);
      user = byEmail[0];
    }

    if (!user) {
      // مقارنة وهمية لمعادلة الزمن ومنع كشف وجود الحسابات.
      await verifyPassword(parsed.data.password, DUMMY_HASH);
      await writeAuditLog({
        category: "auth",
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        description: `محاولة دخول على حساب غير موجود (${identifier})`,
        status: "failure",
        ip,
        userAgent,
        meta: { identifier },
      });
      return fail("اسم المستخدم أو كلمة المرور غير صحيحة.", 401, "INVALID_CREDENTIALS");
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      await writeAuditLog({
        user,
        category: "auth",
        action: AUDIT_ACTIONS.LOGIN_LOCKED,
        description: `محاولة دخول على حساب مقفل (${user.username})`,
        status: "blocked",
        ip,
        userAgent,
      });
      return fail(`الحساب مقفل مؤقتاً. تبقى ${minutes} دقيقة تقريباً.`, 423, "LOCKED");
    }

    if (user.status !== "active") {
      await writeAuditLog({
        user,
        category: "auth",
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        description: `محاولة دخول على حساب موقوف (${user.username})`,
        status: "blocked",
        ip,
        userAgent,
      });
      return fail("هذا الحساب موقوف. راجع مدير النظام.", 403, "SUSPENDED");
    }

    const passwordOk = await verifyPassword(parsed.data.password, user.passwordHash);

    if (!passwordOk) {
      const failedAttempts = user.failedAttempts + 1;
      const shouldLock = failedAttempts >= MAX_FAILED_ATTEMPTS;
      await db
        .update(users)
        .set({
          failedAttempts: shouldLock ? 0 : failedAttempts,
          lockedUntil: shouldLock
            ? new Date(Date.now() + ACCOUNT_LOCK_MINUTES * 60 * 1000)
            : user.lockedUntil,
        })
        .where(eq(users.id, user.id));

      await writeAuditLog({
        user,
        category: "auth",
        action: shouldLock ? AUDIT_ACTIONS.LOGIN_LOCKED : AUDIT_ACTIONS.LOGIN_FAILED,
        description: shouldLock
          ? `قفل الحساب ${user.username} لمدة ${ACCOUNT_LOCK_MINUTES} دقيقة بعد ${MAX_FAILED_ATTEMPTS} محاولات فاشلة`
          : `كلمة مرور خاطئة للحساب ${user.username} (المحاولة ${failedAttempts})`,
        status: shouldLock ? "blocked" : "failure",
        ip,
        userAgent,
        meta: { failedAttempts },
      });

      if (shouldLock) {
        return fail(`تم قفل الحساب لمدة ${ACCOUNT_LOCK_MINUTES} دقيقة بسبب تكرار المحاولات الفاشلة.`, 423, "LOCKED");
      }
      const remaining = MAX_FAILED_ATTEMPTS - failedAttempts;
      return fail(`اسم المستخدم أو كلمة المرور غير صحيحة. المحاولات المتبقية قبل القفل: ${remaining}.`, 401, "INVALID_CREDENTIALS");
    }

    /* --- دخول ناجح --- */
    resetRateLimit(`login:account:${identifier}`);
    await db
      .update(users)
      .set({ failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date(), lastLoginIp: ip, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    await createSessionCookie({
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      role: user.role as Role,
      department: user.department,
    });

    const session = {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      role: user.role as Role,
      roleLabel: ROLE_LABELS[user.role as Role],
      department: user.department,
      permissions: Object.values(PERMISSIONS).filter((permission) => can(user.role as Role, permission)),
      mustChangePassword: user.mustChangePassword,
    };

    await writeAuditLog({
      user: session,
      category: "auth",
      action: AUDIT_ACTIONS.LOGIN_SUCCESS,
      description: `تسجيل دخول ناجح — ${session.fullName} (${session.roleLabel})`,
      status: "success",
      ip,
      userAgent,
      meta: { role: session.role },
    });

    return ok({ user: session });
  } catch (error) {
    return handleUnknownError(error);
  }
}
