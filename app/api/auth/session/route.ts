/**
 * GET /api/auth/session — إرجاع الجلسة الحالية وصلاحياتها.
 * تُستخدمه الواجهة عند الإقلاع لمعرفة المستخدم النشط.
 */
import { getCurrentUser } from "@/lib/auth/session";
import { PERMISSIONS, ROLE_LABELS, can } from "@/lib/auth/rbac";
import { handleUnknownError, ok } from "@/lib/api";
import { ensureDbReady } from "@/db/bootstrap";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureDbReady();
    const user = await getCurrentUser();
    if (!user) return ok({ user: null });

    return ok({
      user: {
        ...user,
        roleLabel: ROLE_LABELS[user.role],
        permissions: Object.values(PERMISSIONS).filter((permission) => can(user.role, permission)),
      },
    });
  } catch (error) {
    return handleUnknownError(error);
  }
}
