/**
 * GET /api/reports/[id] — تفاصيل تقرير أمني واحد.
 */
import { fail, guard, handleUnknownError, ok } from "@/lib/api";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { getReportById } from "@/lib/services/reports";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const result = await guard(request, { permission: PERMISSIONS.reportsRead });
    if (!result.authorized) return result.response;

    const { id } = await params;
    const report = await getReportById(id);
    if (!report) return fail("التقرير غير موجود.", 404);

    return ok({
      report: {
        id: report.id,
        title: report.title,
        period: report.period,
        periodStart: report.periodStart.toISOString(),
        periodEnd: report.periodEnd.toISOString(),
        summary: report.summary,
        generatedByName: report.generatedByName,
        createdAt: report.createdAt.toISOString(),
        metrics: report.metrics as Record<string, unknown>,
      },
    });
  } catch (error) {
    return handleUnknownError(error);
  }
}
