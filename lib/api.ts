/**
 * ============================================================================
 *  مساعدات واجهات البرمجة (API) — حراسة موحّدة وردود قياسية
 * ============================================================================
 */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can, type Permission } from "@/lib/auth/rbac";
import { AUDIT_ACTIONS, writeAuditLog } from "@/lib/audit";
import {
  isTrustedOrigin,
  getRequestContext,
  type RequestContext,
} from "@/lib/security/request";
import {
  LIMITS,
  rateLimit,
} from "@/lib/security/rate-limit";
import { ensureDbReady } from "@/db/bootstrap";
import type { ApiResult, SessionUser } from "@/lib/types";

/** رد نجاح موحّد. */
export function ok<T>(data: T, init?: ResponseInit): NextResponse<ApiResult<T>> {
  return NextResponse.json({ ok: true, data }, init);
}

/** رد خطأ موحّد (بالعربية ليظهر مباشرة في الواجهة). */
export function fail(message: string, status = 400, code?: string): NextResponse<ApiResult<never>> {
  return NextResponse.json({ ok: false, error: message, code }, { status });
}

export type GuardResult =
  | { authorized: true; user: SessionUser; context: RequestContext }
  | { authorized: false; response: NextResponse<ApiResult<never>> };

export type GuardOptions = {
  /** الصلاحية المطلوبة (اختياري — يكفي أن يكون مسجلاً للدخول). */
  permission?: Permission;
  /** السماح فقط لطلبات من نفس المصدر (لطلبات التعديل). */
  requireSameOrigin?: boolean;
  /** تطبيق حد الكتابة بدل حد القراءة. */
  write?: boolean;
};

/**
 * الحارس الموحّد لكل نقاط الـ API:
 *  1) التحقق من صلاحية الجلسة.
 *  2) فحص أصل الطلب (CSRF).
 *  3) تطبيق حد المعدل لكل IP.
 *  4) التحقق من الصلاحية الدقيقة (RBAC) مع تسجيل أي محاولة مرفوضة.
 */
export async function guard(request: Request, options: GuardOptions = {}): Promise<GuardResult> {
  await ensureDbReady();
  const context = await getRequestContext();

  if (options.requireSameOrigin && !isTrustedOrigin(request)) {
    await writeAuditLog({
      category: "system",
      action: "CSRF_BLOCKED",
      description: "طلب مرفوض لعدم تطابق مصدر الطلب (حماية CSRF)",
      status: "blocked",
      ip: context.ip,
      userAgent: context.userAgent,
      meta: { path: new URL(request.url).pathname },
    });
    return { authorized: false, response: fail("مصدر الطلب غير موثوق.", 403, "CSRF") };
  }

  const limitProfile = options.write ? LIMITS.WRITE_PER_IP : LIMITS.API_PER_IP;
  const limiter = rateLimit(`${context.ip}:${new URL(request.url).pathname}`, limitProfile.limit, limitProfile.windowMs);
  if (!limiter.allowed) {
    await writeAuditLog({
      category: "system",
      action: AUDIT_ACTIONS.RATE_LIMITED,
      description: "تم تقييد الطلبات لتجاوز الحد المسموح",
      status: "blocked",
      ip: context.ip,
      userAgent: context.userAgent,
    });
    return {
      authorized: false,
      response: fail(`تم تجاوز حد الطلبات. حاول بعد ${limiter.retryAfterSeconds} ثانية.`, 429, "RATE_LIMITED"),
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { authorized: false, response: fail("الجلسة غير صالحة، يرجى تسجيل الدخول.", 401, "UNAUTHENTICATED") };
  }

  if (options.permission && !can(user.role, options.permission)) {
    await writeAuditLog({
      user,
      category: "system",
      action: AUDIT_ACTIONS.PERMISSION_DENIED,
      description: `محاولة وصول مرفوضة إلى صلاحية ${options.permission}`,
      status: "blocked",
      ip: context.ip,
      userAgent: context.userAgent,
      meta: { path: new URL(request.url).pathname, role: user.role },
    });
    return { authorized: false, response: fail("لا تملك الصلاحية لتنفيذ هذا الإجراء.", 403, "FORBIDDEN") };
  }

  return { authorized: true, user, context };
}

/** قراءة جسم JSON بشكل آمن مع معالجة أخطاء التحليل. */
export async function readJson<T>(request: Request): Promise<{ data?: T; error?: string }> {
  try {
    const body = await request.json();
    return { data: body as T };
  } catch {
    return { error: "جسم الطلب غير صالح." };
  }
}

/** تغليف أخطاء غير متوقعة برسالة عربية موحدة. */
export function handleUnknownError(error: unknown): NextResponse<ApiResult<never>> {
  console.error("[api] خطأ غير متوقع:", error);
  return fail("حدث خطأ غير متوقع في الخادم.", 500, "INTERNAL");
}
