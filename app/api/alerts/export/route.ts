/**
 * GET /api/alerts/export?severity=high — تصدير التنبيهات إلى CSV.
 */
import { fail, guard, handleUnknownError } from "@/lib/api";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { AUDIT_ACTIONS, writeAuditLog } from "@/lib/audit";
import { exportAlertsCsv } from "@/lib/services/reports";
import { SECURITY_HEADERS } from "@/lib/security/request";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const result = await guard(request, { permission: PERMISSIONS.reportsExport });
    if (!result.authorized) return result.response;
    const { user, context } = result;

    const severity = new URL(request.url).searchParams.get("severity") ?? undefined;
    if (severity && !["low", "medium", "high", "critical"].includes(severity)) {
      return fail("قيمة الخطورة غير صالحة.", 400);
    }

    const csv = await exportAlertsCsv(severity);
    await writeAuditLog({
      user,
      category: "alerts",
      action: "ALERT_EXPORT",
      description: `تصدير التنبيهات إلى CSV${severity ? ` (خطورة: ${severity})` : ""}`,
      status: "success",
      ip: context.ip,
      userAgent: context.userAgent,
    });

    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        ...SECURITY_HEADERS,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="alerts-${stamp}.csv"`,
      },
    });
  } catch (error) {
    return handleUnknownError(error);
  }
}
