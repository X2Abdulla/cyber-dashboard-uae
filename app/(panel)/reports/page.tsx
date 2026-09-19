"use client";

/**
 * ============================================================================
 *  التقارير الأمنية الدورية — توليد وعرض وتصدير
 * ============================================================================
 *  يولّد المشرف/المدير تقريراً (يومياً/أسبوعياً/شهرياً) من البيانات الحقيقية
 *  في قاعدة البيانات، ثم يمكن عرضه أو تصديره CSV / JSON / TXT أو طباعته.
 */
import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/session-context";
import { BarList, DonutChart } from "@/components/charts";
import { Icon } from "@/components/icons";
import { Badge, Button, EmptyState, ErrorState, Field, LiveDot, LoadingBlock, Modal, Panel, useToast } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";
import { cn, formatDateTime, formatNumber, PERIOD_LABELS, SEVERITY_LABELS } from "@/lib/format";
import { PERMISSIONS } from "@/lib/auth/rbac";
import type { ReportMetrics } from "@/lib/services/reports";
import type { ReportPeriod } from "@/lib/types";

type ReportRow = {
  id: string;
  title: string;
  period: ReportPeriod;
  periodStart: string;
  periodEnd: string;
  summary: string;
  generatedByName: string | null;
  createdAt: string;
  metrics: ReportMetrics;
};

export default function ReportsPage() {
  const { allowed } = useSession();
  const toast = useToast();
  const canGenerate = allowed(PERMISSIONS.reportsGenerate);
  const canExport = allowed(PERMISSIONS.reportsExport);

  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<ReportPeriod>("weekly");
  const [generating, setGenerating] = useState(false);
  const [selected, setSelected] = useState<ReportRow | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ reports: ReportRow[] }>("/api/reports");
      setReports(data.reports);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "تعذر تحميل التقارير.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const generate = async () => {
    setGenerating(true);
    try {
      const data = await api.post<{ report: ReportRow }>("/api/reports", { period });
      toast.push("success", `تم توليد التقرير ${PERIOD_LABELS[period]} بنجاح وحفظه في الأرشيف.`);
      setReports((current) => [data.report, ...current]);
      setSelected(data.report);
    } catch (caught) {
      toast.push("error", caught instanceof ApiError ? caught.message : "تعذر توليد التقرير.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-5">
      <Panel
        title="توليد تقرير أمني دوري"
        subtitle="يُبنى من البيانات الفعلية: التنبيهات، الملفات، المصادقة، الأصول، وسجل العمليات"
        icon="reports"
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Field label="دورية التقرير">
            <select className="field" value={period} onChange={(event) => setPeriod(event.target.value as ReportPeriod)}>
              <option value="daily">يومي — آخر 24 ساعة</option>
              <option value="weekly">أسبوعي — آخر 7 أيام</option>
              <option value="monthly">شهري — آخر 30 يوماً</option>
            </select>
          </Field>
          <div className="flex items-end">
            <Button variant="primary" icon="spark" loading={generating} disabled={!canGenerate} onClick={generate} className="w-full sm:w-auto">
              {canGenerate ? "توليد التقرير الآن" : "لا تملك صلاحية التوليد"}
            </Button>
          </div>
        </div>
        <p className="mono mt-3 flex items-center gap-2 text-[10px] text-slate-500">
          <LiveDot tone="cyan" />
          التقارير الدورية تُحفظ في الأرشيف ويمكن تصديرها بصيغ CSV / JSON / TXT.
        </p>
      </Panel>

      <Panel
        title="أرشيف التقارير"
        subtitle={`${reports.length} تقرير محفوظ`}
        icon="audit"
        actions={
          <Button variant="ghost" icon="refresh" className="px-3 py-1.5 text-[11px]" onClick={load}>
            تحديث
          </Button>
        }
      >
        {loading && reports.length === 0 ? (
          <LoadingBlock label="جارٍ تحميل الأرشيف..." />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : reports.length === 0 ? (
          <EmptyState icon="reports" title="لا توجد تقارير بعد" hint="ولّد تقريرك الأول من الأعلى — يستغرق ثانية واحدة." />
        ) : (
          <ul className="space-y-3">
            {reports.map((report) => (
              <li key={report.id} className="panel panel-hover p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-bold text-white">{report.title}</p>
                      <Badge className="border-cyan-400/25 bg-cyan-400/8 text-cyan-200">{PERIOD_LABELS[report.period]}</Badge>
                      <Badge
                        className={cn(
                          report.metrics.securityScore >= 75
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                            : report.metrics.securityScore >= 50
                              ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                              : "border-rose-500/35 bg-rose-500/12 text-rose-200",
                        )}
                      >
                        الدرجة {report.metrics.securityScore}/100
                      </Badge>
                    </div>
                    <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-slate-400">{report.summary}</p>
                    <p className="mono mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
                      <span>{formatDateTime(report.periodStart)} ← {formatDateTime(report.periodEnd)}</span>
                      <span>أعدّه: {report.generatedByName ?? "النظام"}</span>
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button variant="ghost" icon="eye" className="px-2.5 py-1.5 text-[11px]" onClick={() => setSelected(report)}>
                      عرض
                    </Button>
                    {canExport && (
                      <>
                        <a className="btn-ghost px-2.5 py-1.5 text-[11px]" href={`/api/reports/${report.id}/export?format=csv`} download>
                          <Icon name="download" className="h-3.5 w-3.5" /> CSV
                        </a>
                        <a className="btn-ghost px-2.5 py-1.5 text-[11px]" href={`/api/reports/${report.id}/export?format=json`} download>
                          <Icon name="download" className="h-3.5 w-3.5" /> JSON
                        </a>
                        <a className="btn-ghost px-2.5 py-1.5 text-[11px]" href={`/api/reports/${report.id}/export?format=txt`} download>
                          <Icon name="download" className="h-3.5 w-3.5" /> TXT
                        </a>
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* ------------------------------ عرض التقرير ------------------------------ */}
      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.title ?? ""}
        subtitle={selected ? `${formatDateTime(selected.periodStart)} → ${formatDateTime(selected.periodEnd)}` : undefined}
        icon="reports"
        size="xl"
        footer={
          <>
            <Button variant="ghost" icon="print" onClick={() => window.print()}>
              طباعة
            </Button>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              إغلاق
            </Button>
          </>
        }
      >
        {selected && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-cyan-400/20 bg-gradient-to-l from-cyan-500/10 to-transparent p-4">
              <p className="mono mb-1.5 text-[10px] font-bold uppercase tracking-widest text-cyan-300">الملخص التنفيذي</p>
              <p className="text-[12px] leading-relaxed text-slate-200">{selected.summary}</p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <MetricCell label="إجمالي التنبيهات" value={selected.metrics.alerts.total} />
              <MetricCell label="حرجة" value={selected.metrics.alerts.critical} tone="rose" />
              <MetricCell label="نسبة المعالجة" value={`${selected.metrics.alerts.resolutionRate}%`} tone="mint" />
              <MetricCell label="الدرجة الأمنية" value={`${selected.metrics.securityScore}/100`} tone="cyan" />
              <MetricCell label="ملفات مرفوعة" value={selected.metrics.files.uploaded} />
              <MetricCell label="ملفات ضارة" value={selected.metrics.files.malicious} tone="rose" />
              <MetricCell label="دخول فاشل" value={selected.metrics.auth.failedLogins} tone="amber" />
              <MetricCell label="عمليات محظورة" value={selected.metrics.auth.blockedActions} tone="amber" />
              <MetricCell label="أجهزة متصلة" value={selected.metrics.devices.online} tone="mint" />
              <MetricCell label="أجهزة معزولة" value={selected.metrics.devices.quarantined} tone="rose" />
              <MetricCell label="مخالفة السياسة" value={selected.metrics.devices.nonCompliant} tone="amber" />
              <MetricCell label="مستخدمون نشطون" value={selected.metrics.users.active} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/8 bg-white/3 p-4">
                <p className="mono mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">توزيع التنبيهات حسب الخطورة</p>
                <DonutChart
                  data={[
                    { label: SEVERITY_LABELS.critical, value: selected.metrics.alerts.critical, color: "#fb7185" },
                    { label: SEVERITY_LABELS.high, value: selected.metrics.alerts.high, color: "#fb923c" },
                    { label: SEVERITY_LABELS.medium, value: selected.metrics.alerts.medium, color: "#fbbf24" },
                    { label: SEVERITY_LABELS.low, value: selected.metrics.alerts.low, color: "#38bdf8" },
                  ].filter((item) => item.value > 0)}
                  centerLabel="تنبيه"
                />
              </div>

              <div className="rounded-2xl border border-white/8 bg-white/3 p-4">
                <p className="mono mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">أكثر التهديدات تكراراً</p>
                <BarList data={selected.metrics.threatsByType.map((item) => ({ label: item.label, value: item.count }))} />
                {selected.metrics.topSourceIps.length > 0 && (
                  <>
                    <p className="mono mb-2 mt-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">أعلى عناوين المصدر</p>
                    <ul className="space-y-1.5">
                      {selected.metrics.topSourceIps.map((ip) => (
                        <li key={ip.ip} className="flex items-center justify-between rounded-lg border border-white/8 bg-abyss-850/60 px-3 py-1.5">
                          <span className="mono text-[11px] text-slate-300" dir="ltr">
                            {ip.ip}
                          </span>
                          <span className="mono text-[11px] font-bold text-rose-300">{ip.count}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function MetricCell({ label, value, tone = "slate" }: { label: string; value: number | string; tone?: "slate" | "rose" | "mint" | "cyan" | "amber" }) {
  const tones = {
    slate: "text-white",
    rose: "text-rose-300",
    mint: "text-emerald-300",
    cyan: "text-cyan-300",
    amber: "text-amber-300",
  };
  return (
    <div className="rounded-xl border border-white/8 bg-white/3 p-3 text-center">
      <p className={cn("mono text-lg font-bold", tones[tone])}>{typeof value === "number" ? formatNumber(value) : value}</p>
      <p className="mt-0.5 text-[10px] text-slate-400">{label}</p>
    </div>
  );
}
