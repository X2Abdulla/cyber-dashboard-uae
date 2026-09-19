/**
 * /api/reports — قائمة التقارير + توليد تقرير أمني دوري جديد.
 */
import { z } from "zod";
import { fail, guard, handleUnknownError, ok, readJson } from "@/lib/api";
import { AUDIT_ACTIONS, writeAuditLog } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { generateReport, listReports } from "@/lib/services/reports";
import type { ReportPeriod } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const result = await guard(request, { permission: PERMISSIONS.reportsRead });
    if (!result.authorized) return result.response;

    const rows = await listReports(40);
    return ok({
      reports: rows.map((row) => ({
        id: row.id,
        title: row.title,
        period: row.period,
        periodStart: row.periodStart.toISOString(),
        periodEnd: row.periodEnd.toISOString(),
        summary: row.summary,
        generatedByName: row.generatedByName,
        createdAt: row.createdAt.toISOString(),
        metrics: row.metrics as Record<string, unknown>,
      })),
    });
  } catch (error) {
    return handleUnknownError(error);
  }
}

const schema = z.object({ period: z.enum(["daily", "weekly", "monthly"]) });

export async function POST(request: Request) {
  try {
    const result = await guard(request, {
      permission: PERMISSIONS.reportsGenerate,
      write: true,
      requireSameOrigin: true,
    });
    if (!result.authorized) return result.response;
    const { user, context } = result;

    const body = await readJson<z.infer<typeof schema>>(request);
    const period: ReportPeriod = (body.data && schema.safeParse(body.data).success
      ? schema.parse(body.data).period
      : "weekly");

    const report = await generateReport(period, user);

    await writeAuditLog({
      user,
      category: "reports",
      action: AUDIT_ACTIONS.REPORT_GENERATE,
      description: `توليد تقرير أمني ${period === "daily" ? "يومي" : period === "weekly" ? "أسبوعي" : "شهري"}`,
      status: "success",
      ip: context.ip,
      userAgent: context.userAgent,
      meta: { reportId: report.id },
    });

    return ok(
      {
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
      },
      { status: 201 },
    );
  } catch (error) {
    return handleUnknownError(error);
  }
}
