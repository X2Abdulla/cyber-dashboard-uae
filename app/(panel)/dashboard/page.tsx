"use client";

/**
 * ============================================================================
 *  لوحة التحكم — المؤشرات الحية والرسوم البيانية والتنبيهات الفورية
 * ============================================================================
 *  تسحب البيانات من /api/metrics كل 6 ثوانٍ (المحرك الحي يولّد نقاطاً جديدة)،
 *  وكل الرسوم مرسومة بـ SVG داخلياً فتعمل بسلاسة على الجوال.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BarList,
  ColumnChart,
  DonutChart,
  GaugeRing,
  LiveAreaChart,
  Sparkline,
} from "@/components/charts";
import { BrandMark } from "@/components/icons";
import { Icon, type IconName } from "@/components/icons";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LiveDot,
  LoadingBlock,
  Panel,
  RiskBar,
} from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";
import {
  ALERT_STATUS_LABELS,
  ALERT_STATUS_STYLES,
  cn,
  DEVICE_STATUS_LABELS,
  DEVICE_TYPE_LABELS,
  formatDateTime,
  formatNumber,
  formatRelative,
  SEVERITY_LABELS,
  SEVERITY_STYLES,
  THREAT_TYPE_LABELS,
} from "@/lib/format";
import type { AlertStatus, MetricPoint, Severity } from "@/lib/types";

type DashboardResponse = {
  kpis: {
    openAlerts: number;
    criticalOpen: number;
    threats24h: number;
    blocked24h: number;
    filesScanned: number;
    maliciousFiles: number;
    devicesTotal: number;
    devicesOnline: number;
    devicesQuarantined: number;
    activeUsers: number;
    failedLogins24h: number;
    securityScore: number;
    averageRisk: number;
  };
  series: { traffic: MetricPoint[]; threats: MetricPoint[]; blocked: MetricPoint[]; scans: MetricPoint[] };
  severityDistribution: { severity: string; count: number }[];
  threatTypes: { type: string; count: number }[];
  weeklyTrend: { day: string; count: number }[];
  deviceRisk: { name: string; type: string; riskScore: number; status: string }[];
  recentAlerts: {
    id: string;
    title: string;
    type: string;
    severity: Severity;
    status: AlertStatus;
    sourceIp: string | null;
    detectedAt: string;
  }[];
  recentActivity: {
    id: string;
    username: string | null;
    category: string;
    action: string;
    description: string;
    status: string;
    ip: string | null;
    createdAt: string;
  }[];
  notifications: { id: string; title: string; severity: Severity; type: string; detectedAt: string }[];
  generatedAt: string;
};

const REFRESH_MS = 6000;

export default function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.get<DashboardResponse>("/api/metrics");
      setData(result);
      setLastUpdate(new Date());
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "تعذر تحميل المؤشرات.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [autoRefresh, load]);

  const chartSeries = useMemo(() => {
    if (!data) return [];
    return [
      { name: "حركة الشبكة", color: "#22d3ee", points: data.series.traffic },
      { name: "محاولات تهديد", color: "#fb7185", points: data.series.threats },
      { name: "طلبات محظورة", color: "#fbbf24", points: data.series.blocked },
      { name: "عمليات فحص", color: "#34d399", points: data.series.scans },
    ];
  }, [data]);

  const severityData = useMemo(() => {
    const palette: Record<string, string> = { critical: "#fb7185", high: "#fb923c", medium: "#fbbf24", low: "#38bdf8" };
    const map = new Map<string, number>();
    for (const row of data?.severityDistribution ?? []) map.set(row.severity, row.count);
    return (["critical", "high", "medium", "low"] as Severity[])
      .filter((severity) => (map.get(severity) ?? 0) > 0)
      .map((severity) => ({ label: SEVERITY_LABELS[severity], value: map.get(severity) ?? 0, color: palette[severity]! }));
  }, [data]);

  if (loading && !data) return <LoadingBlock label="جارٍ تهيئة مركز العمليات..." />;

  return (
    <div className="space-y-5">
      {/* ------------------------------ شريط الحالة ------------------------------ */}
      <div className="panel relative overflow-hidden p-4 sm:p-5">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 animate-scanline bg-gradient-to-b from-cyan-400/10 to-transparent" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BrandMark className="h-11 w-11" />
            <div>
              <h2 className="text-base font-extrabold text-white sm:text-lg">مركز العمليات الأمنية — حالة حية</h2>
              <p className="mono mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <LiveDot tone={autoRefresh ? "emerald" : "amber"} />
                  {autoRefresh ? `تحديث تلقائي كل ${REFRESH_MS / 1000} ثوانٍ` : "التحديث التلقائي متوقف"}
                </span>
                {lastUpdate && <span>آخر تحديث: {formatDateTime(lastUpdate)}</span>}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={cn(data && data.kpis.criticalOpen > 0 ? "border-rose-500/40 bg-rose-500/12 text-rose-200" : "border-emerald-500/35 bg-emerald-500/10 text-emerald-200")} dot>
              {data && data.kpis.criticalOpen > 0 ? `${data.kpis.criticalOpen} تهديد حرج مفتوح` : "لا تهديدات حرجة مفتوحة"}
            </Badge>
            <Button variant="ghost" icon="refresh" onClick={load} title="تحديث الآن">
              تحديث
            </Button>
            <Button variant={autoRefresh ? "soft" : "ghost"} icon={autoRefresh ? "check" : "clock"} onClick={() => setAutoRefresh((value) => !value)}>
              {autoRefresh ? "الإيقاف المؤقت" : "تفعيل البث الحي"}
            </Button>
          </div>
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={load} />}

      {/* --------------------------------- البطاقات -------------------------------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
        <StatCard
          label="تنبيهات مفتوحة"
          value={data?.kpis.openAlerts ?? 0}
          icon="alerts"
          tone="rose"
          spark={data?.series.threats.map((point) => point.value) ?? []}
          hint={`${data?.kpis.criticalOpen ?? 0} حرجة`}
        />
        <StatCard
          label="تهديدات 24 ساعة"
          value={data?.kpis.threats24h ?? 0}
          icon="virus"
          tone="amber"
          spark={data?.series.blocked.map((point) => point.value) ?? []}
          hint={`${data?.kpis.blocked24h ?? 0} عملية محظورة`}
        />
        <StatCard
          label="ملفات مفحوصة"
          value={data?.kpis.filesScanned ?? 0}
          icon="files"
          tone="cyan"
          spark={data?.series.scans.map((point) => point.value) ?? []}
          hint={`${data?.kpis.maliciousFiles ?? 0} غير سليمة`}
        />
        <StatCard
          label="أجهزة متصلة"
          value={data?.kpis.devicesOnline ?? 0}
          icon="devices"
          tone="mint"
          spark={data?.series.traffic.map((point) => point.value) ?? []}
          hint={`من ${data?.kpis.devicesTotal ?? 0} أصل`}
        />
        <StatCard
          label="دخول فاشل"
          value={data?.kpis.failedLogins24h ?? 0}
          icon="key"
          tone="violet"
          spark={data?.series.threats.map((point) => point.value) ?? []}
          hint="محاولات 24 ساعة"
        />
        <StatCard
          label="أجهزة معزولة"
          value={data?.kpis.devicesQuarantined ?? 0}
          icon="shield"
          tone="rose"
          spark={data?.series.blocked.map((point) => point.value) ?? []}
          hint={`متوسط الخطورة ${data?.kpis.averageRisk ?? 0}`}
        />
      </div>

      {/* ------------------------- الرسم الحي + الدرجة الأمنية --------------------- */}
      <div className="grid gap-4 xl:grid-cols-[1.65fr_1fr]">
        <Panel
          title="البث الحي للنشاط الأمني"
          subtitle="حركة الشبكة مقابل التهديدات والطلبات المحظورة — آخر 60 دقيقة"
          icon="activity"
          actions={
            <Link href="/reports" className="btn-ghost px-3 py-1.5 text-[11px]">
              <Icon name="reports" className="h-3.5 w-3.5" />
              تقارير مفصلة
            </Link>
          }
        >
          {chartSeries.length > 0 && chartSeries[0]!.points.length > 1 ? (
            <LiveAreaChart series={chartSeries} height={240} />
          ) : (
            <EmptyState icon="activity" title="لا توجد نقاط حية بعد" hint="سيبدأ المحرك بتوليد البيانات خلال ثوانٍ." />
          )}
        </Panel>

        <Panel title="الدرجة الأمنية الشاملة" subtitle="محسوبة آلياً من التهديدات المفتوحة والامتثال" icon="shield">
          <div className="flex flex-col items-center gap-4">
            <GaugeRing value={data?.kpis.securityScore ?? 0} />
            <div className="grid w-full grid-cols-2 gap-2 text-center">
              <MiniStat label="تهديدات أسبوع" value={data?.threatTypes.reduce((sum, item) => sum + item.count, 0) ?? 0} />
              <MiniStat label="مستخدمون نشطون" value={data?.kpis.activeUsers ?? 0} />
              <MiniStat label="ملفات محجوزة" value={data?.kpis.maliciousFiles ?? 0} />
              <MiniStat label="عمليات محظورة" value={data?.kpis.blocked24h ?? 0} />
            </div>
          </div>
        </Panel>
      </div>

      {/* --------------------------- التوزيعات والاتجاهات -------------------------- */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="توزيع التنبيهات المفتوحة" subtitle="حسب مستوى الخطورة" icon="filter">
          {severityData.length > 0 ? (
            <DonutChart data={severityData} centerLabel="تنبيه مفتوح" />
          ) : (
            <EmptyState icon="check" title="لا تنبيهات مفتوحة" hint="كل التهديدات معالجة — حالة ممتازة." />
          )}
        </Panel>

        <Panel title="اتجاه التهديدات" subtitle="عدد التنبيهات خلال آخر 7 أيام" icon="activity">
          <ColumnChart data={(data?.weeklyTrend ?? []).map((row) => ({ label: row.day, value: row.count }))} />
        </Panel>

        <Panel title="أكثر التهديدات تكراراً" subtitle="خلال الأسبوع الحالي" icon="virus">
          <BarList
            data={(data?.threatTypes ?? []).map((row) => ({ label: THREAT_TYPE_LABELS[row.type] ?? row.type, value: row.count }))}
          />
        </Panel>
      </div>

      {/* ------------------------- التنبيهات والأصول والنشاط ---------------------- */}
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Panel
          title="أحدث التنبيهات"
          subtitle="آخر ما رصده المحرك"
          icon="alerts"
          actions={
            <Link href="/alerts" className="btn-ghost px-3 py-1.5 text-[11px]">
              كل التنبيهات
              <Icon name="chevronLeft" className="h-3.5 w-3.5" />
            </Link>
          }
          bodyClassName="p-0"
        >
          {data && data.recentAlerts.length > 0 ? (
            <ul className="divide-y divide-white/5">
              {data.recentAlerts.map((alert) => (
                <li key={alert.id} className="flex flex-wrap items-center gap-2 px-4 py-3 transition hover:bg-white/4 sm:flex-nowrap">
                  <span
                    className={cn(
                      "grid h-8 w-8 shrink-0 place-items-center rounded-lg border",
                      alert.severity === "critical" ? "border-rose-500/35 bg-rose-500/12 text-rose-300" : alert.severity === "high" ? "border-orange-500/35 bg-orange-500/12 text-orange-300" : "border-sky-500/30 bg-sky-500/10 text-sky-300",
                    )}
                  >
                    <Icon name={alert.severity === "low" ? "info" : "warning"} className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-semibold text-slate-100">{alert.title}</p>
                    <p className="mono mt-0.5 truncate text-[10px] text-slate-500">
                      {THREAT_TYPE_LABELS[alert.type] ?? alert.type} • {alert.sourceIp ?? "مصدر داخلي"} • {formatRelative(alert.detectedAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge className={SEVERITY_STYLES[alert.severity]}>{SEVERITY_LABELS[alert.severity]}</Badge>
                    <Badge className={ALERT_STATUS_STYLES[alert.status]}>{ALERT_STATUS_LABELS[alert.status]}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="shield" title="لا توجد تنبيهات حديثة" />
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="الأصول الأعلى خطورة" subtitle="تحتاج مراجعة فورية" icon="devices">
            {data && data.deviceRisk.length > 0 ? (
              <ul className="space-y-3">
                {data.deviceRisk.map((device) => (
                  <li key={device.name} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="truncate font-semibold text-slate-200">{device.name}</span>
                      <Badge className="border-white/10 bg-white/5 text-slate-400">
                        {DEVICE_TYPE_LABELS[device.type] ?? device.type} • {DEVICE_STATUS_LABELS[device.status as keyof typeof DEVICE_STATUS_LABELS]}
                      </Badge>
                    </div>
                    <RiskBar value={device.riskScore} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon="devices" title="لا توجد أصول مسجلة" />
            )}
          </Panel>

          <Panel
            title="سجل النشاط الأخير"
            subtitle="مقتطف من سجل العمليات"
            icon="audit"
            actions={
              <Link href="/audit" className="btn-ghost px-3 py-1.5 text-[11px]">
                السجل الكامل
              </Link>
            }
            bodyClassName="p-0"
          >
            <ul className="max-h-72 divide-y divide-white/5 overflow-y-auto">
              {(data?.recentActivity ?? []).map((entry) => (
                <li key={entry.id} className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[11px] font-semibold text-slate-200">{entry.description}</p>
                    <span
                      className={cn(
                        "mono shrink-0 text-[9px] font-bold",
                        entry.status === "success" ? "text-emerald-300" : entry.status === "failure" ? "text-amber-300" : "text-rose-300",
                      )}
                    >
                      {entry.status === "success" ? "نجاح" : entry.status === "failure" ? "فشل" : "محظور"}
                    </span>
                  </div>
                  <p className="mono mt-0.5 truncate text-[9px] text-slate-500">
                    {entry.username ?? "system"} • {entry.category} • {entry.ip ?? "—"} • {formatRelative(entry.createdAt)}
                  </p>
                </li>
              ))}
              {data && data.recentActivity.length === 0 && (
                <li>
                  <EmptyState icon="audit" title="لا نشاط مسجّل بعد" />
                </li>
              )}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              مكونات مساعدة                                  */
/* -------------------------------------------------------------------------- */

const TONES: Record<string, { border: string; text: string; glow: string }> = {
  cyan: { border: "border-cyan-400/25", text: "text-cyan-300", glow: "shadow-[0_0_30px_-14px_rgba(34,211,238,0.9)]" },
  rose: { border: "border-rose-400/25", text: "text-rose-300", glow: "shadow-[0_0_30px_-14px_rgba(251,113,133,0.9)]" },
  amber: { border: "border-amber-400/25", text: "text-amber-300", glow: "shadow-[0_0_30px_-14px_rgba(251,191,36,0.9)]" },
  mint: { border: "border-emerald-400/25", text: "text-emerald-300", glow: "shadow-[0_0_30px_-14px_rgba(52,211,153,0.9)]" },
  violet: { border: "border-violet-400/25", text: "text-violet-300", glow: "shadow-[0_0_30px_-14px_rgba(167,139,250,0.9)]" },
};

function StatCard({
  label,
  value,
  icon,
  tone,
  spark,
  hint,
}: {
  label: string;
  value: number;
  icon: IconName;
  tone: keyof typeof TONES | string;
  spark: number[];
  hint?: string;
}) {
  const styles = TONES[tone] ?? TONES.cyan!;
  const colorMap: Record<string, string> = { cyan: "#22d3ee", rose: "#fb7185", amber: "#fbbf24", mint: "#34d399", violet: "#a78bfa" };

  return (
    <article className={cn("panel panel-hover flex flex-col justify-between gap-3 p-3.5", styles.border, styles.glow)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-slate-400">{label}</p>
          <p className="stat-value mt-1">{formatNumber(value)}</p>
          {hint && <p className="mono mt-1 truncate text-[9px] text-slate-500">{hint}</p>}
        </div>
        <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl border bg-white/4", styles.border, styles.text)}>
          <Icon name={icon} className="h-4 w-4" />
        </span>
      </div>
      <div className="-mb-1 self-end opacity-90">
        <Sparkline values={spark.slice(-24)} color={colorMap[tone] ?? "#22d3ee"} width={96} height={26} />
      </div>
    </article>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/3 px-2 py-2.5">
      <p className="mono text-lg font-bold text-white">{formatNumber(value)}</p>
      <p className="mt-0.5 text-[10px] text-slate-400">{label}</p>
    </div>
  );
}
