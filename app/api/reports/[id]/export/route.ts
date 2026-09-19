/**
 * GET /api/reports/[id]/export?format=csv|json|txt — تصدير تقرير أمني.
 */
import { NextResponse } from "next/server";
import { fail, guard, handleUnknownError } from "@/lib/api";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { AUDIT_ACTIONS, writeAuditLog } from "@/lib/audit";
import { getReportById, reportToRows, toCsv } from "@/lib/services/reports";
import { SECURITY_HEADERS } from "@/lib/security/request";
import type { ReportMetrics } from "@/lib/services/reports";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const result = await guard(request, { permission: PERMISSIONS.reportsExport });
    if (!result.authorized) return result.response;
    const { user, context } = result;

    const { id } = await params;
    const format = new URL(request.url).searchParams.get("format") ?? "csv";
    const report = await getReportById(id);
    if (!report) return fail("التقرير غير موجود.", 404);

    const metrics = report.metrics as unknown as ReportMetrics;
    const stamp = report.createdAt.toISOString().slice(0, 10);
    const baseName = `deraa-report-${report.period}-${stamp}`;

    await writeAuditLog({
      user,
      category: "reports",
      action: AUDIT_ACTIONS.REPORT_EXPORT,
      description: `تصدير التقرير «${report.title}» بصيغة ${format.toUpperCase()}`,
      status: "success",
      ip: context.ip,
      userAgent: context.userAgent,
      meta: { reportId: id, format },
    });

    if (format === "json") {
      return new Response(
        JSON.stringify(
          {
            title: report.title,
            period: report.period,
            periodStart: report.periodStart.toISOString(),
            periodEnd: report.periodEnd.toISOString(),
            generatedBy: report.generatedByName,
            summary: report.summary,
            metrics,
          },
          null,
          2,
        ),
        {
          headers: {
            ...SECURITY_HEADERS,
            "Content-Type": "application/json; charset=utf-8",
            "Content-Disposition": `attachment; filename="${baseName}.json"`,
          },
        },
      );
    }

    if (format === "txt") {
      const text = [
        "═══════════════════════════════════════════════════════════",
        "        نظام دِرْع — تقرير أمني دوري",
        "═══════════════════════════════════════════════════════════",
        `العنوان: ${report.title}`,
        `الفترة: ${report.periodStart.toLocaleDateString("ar-EG")} → ${report.periodEnd.toLocaleDateString("ar-EG")}`,
        `أعدّه: ${report.generatedByName ?? "النظام"}`,
        "",
        "الملخص التنفيذي:",
        report.summary,
        "",
        "──────────────── المؤشرات التفصيلية ────────────────",
        ...reportToRows(metrics).map(
          (row) => `• [${row["التصنيف"]}] ${row["المؤشر"]}: ${row["القيمة"]}`,
        ),
        "",
        `تم التوليد في: ${new Date().toISOString()}`,
      ].join("\n");

      return new Response(text, {
        headers: {
          ...SECURITY_HEADERS,
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="${baseName}.txt"`,
        },
      });
    }

    const csv = toCsv(reportToRows(metrics), ["المؤشر", "التصنيف", "القيمة"]);
    return NextResponseCsv(csv, `${baseName}.csv`);
  } catch (error) {
    return handleUnknownError(error);
  }
}

function NextResponseCsv(csv: string, filename: string) {
  return new Response(csv, {
    headers: {
      ...SECURITY_HEADERS,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
