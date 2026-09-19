/**
 * POST /api/auth/logout — إنهاء الجلسة وتسجيل الخروج.
 */
import { fail, guard, handleUnknownError, ok } from "@/lib/api";
import { AUDIT_ACTIONS, writeAuditLog } from "@/lib/audit";
import { destroySessionCookie } from "@/lib/auth/session";
import { isTrustedOrigin } from "@/lib/security/request";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!isTrustedOrigin(request)) return fail("مصدر الطلب غير موثوق.", 403, "CSRF");
    const result = await guard(request);

    if (result.authorized) {
      await writeAuditLog({
        user: result.user,
        category: "auth",
        action: AUDIT_ACTIONS.LOGOUT,
        description: `تسجيل خروج — ${result.user.fullName}`,
        status: "success",
        ip: result.context.ip,
        userAgent: result.context.userAgent,
      });
    }

    await destroySessionCookie();
    return ok({ loggedOut: true });
  } catch (error) {
    return handleUnknownError(error);
  }
}
