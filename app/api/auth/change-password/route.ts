/**
 * POST /api/auth/change-password — تغيير كلمة المرور من المستخدم نفسه.
 * يتطلب كلمة المرور الحالية + اجتياز سياسة القوة، ويُعيد إصدار الجلسة.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { fail, guard, handleUnknownError, ok, readJson } from "@/lib/api";
import { AUDIT_ACTIONS, writeAuditLog } from "@/lib/audit";
import { hashPassword, validatePasswordPolicy, verifyPassword } from "@/lib/auth/password";
import { createSessionCookie } from "@/lib/auth/session";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

const schema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  try {
    const result = await guard(request, { write: true, requireSameOrigin: true });
    if (!result.authorized) return result.response;
    const { user, context } = result;

    const body = await readJson<z.infer<typeof schema>>(request);
    if (body.error) return fail(body.error);
    const parsed = schema.safeParse(body.data);
    if (!parsed.success) return fail("بيانات غير صالحة.");

    const issues = validatePasswordPolicy(parsed.data.newPassword);
    if (issues.length > 0) return fail(issues[0]!.message);
    if (parsed.data.newPassword === parsed.data.currentPassword) {
      return fail("كلمة المرور الجديدة يجب أن تختلف عن الحالية.");
    }

    const rows = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    const record = rows[0];
    if (!record) return fail("الحساب غير موجود.", 404);

    const valid = await verifyPassword(parsed.data.currentPassword, record.passwordHash);
    if (!valid) {
      await writeAuditLog({
        user,
        category: "auth",
        action: "PASSWORD_CHANGE_FAILED",
        description: "محاولة تغيير كلمة مرور بكلمة حالية خاطئة",
        status: "failure",
        ip: context.ip,
        userAgent: context.userAgent,
      });
      return fail("كلمة المرور الحالية غير صحيحة.", 401);
    }

    const passwordHash = await hashPassword(parsed.data.newPassword);
    await db
      .update(users)
      .set({ passwordHash, mustChangePassword: false, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    // إعادة إصدار الجلسة بعد تغيير كلمة المرور.
    await createSessionCookie({
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      role: user.role as Role,
      department: user.department,
    });

    await writeAuditLog({
      user,
      category: "auth",
      action: "PASSWORD_CHANGE",
      description: `قام ${user.fullName} بتغيير كلمة المرور الخاصة به`,
      status: "success",
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return ok({ changed: true, auditAction: AUDIT_ACTIONS.USER_PASSWORD_RESET });
  } catch (error) {
    return handleUnknownError(error);
  }
}
