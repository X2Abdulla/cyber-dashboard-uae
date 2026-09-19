/**
 * GET /api/metrics — بيانات لوحة التحكم الحية.
 * يشغّل محرك المؤشرات (بحد أقصى مرة كل 8 ثوانٍ) ثم يعيد كل المؤشرات المجمّعة.
 */
import { guard, handleUnknownError, ok } from "@/lib/api";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { getDashboardData, getNotificationFeed } from "@/lib/services/dashboard";
import { tickLiveEngine } from "@/lib/simulator";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const result = await guard(request, { permission: PERMISSIONS.dashboardRead });
    if (!result.authorized) return result.response;

    await tickLiveEngine();
    const [dashboard, notifications] = await Promise.all([getDashboardData(), getNotificationFeed(6)]);
    return ok({ ...dashboard, notifications });
  } catch (error) {
    return handleUnknownError(error);
  }
}
