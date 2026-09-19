/**
 * GET /api/audit/export?status=success — تصدير سجل العمليات إلى CSV.
 */
import { guard, handleUnknownError } from "@/lib/api";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { AUDIT_ACTIONS, writeAuditLog } from "@/lib/audit";
import { exportAuditCsv } from "@/lib/services/reports";
import { SECURITY_HEADERS } from "@/lib/security/request";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const result = await guard(request, { permission: PERMISSIONS.auditExport });
    if (!result.authorized) return result.response;
    const { user, context } = result;

    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? undefined;
    const csv = await exportAuditCsv(status);

    await writeAuditLog({
      user,
      category: "system",
      action: AUDIT_ACTIONS.AUDIT_EXPORT,
      description: `تصدير سجل العمليات إلى CSV${status ? ` (فلتر: ${status})` : ""}`,
      status: "success",
      ip: context.ip,
      userAgent: context.userAgent,
    });

    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        ...SECURITY_HEADERS,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit-log-${stamp}.csv"`,
      },
    });
  } catch (error) {
    return handleUnknownError(error);
  }
}
