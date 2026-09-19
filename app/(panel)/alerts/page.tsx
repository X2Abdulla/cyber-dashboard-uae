"use client";

/**
 * ============================================================================
 *  التنبيهات الأمنية — رصد ومعالجة وإغلاق
 * ============================================================================
 *  - فلاتر: الحالة، الخطورة، البحث النصي.
 *  - إجراءات (لمن يملك alerts:manage): تحقيق، معالجة مع ملاحظة، عزل الجهاز
 *    المرتبط تلقائياً، تحديد كإنذار كاذب، حذف.
 *  - إنشاء تنبيه يدوي + تصدير CSV.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "@/components/session-context";
import { Icon } from "@/components/icons";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  LiveDot,
  LoadingBlock,
  Modal,
  Panel,
  RiskBar,
  useToast,
} from "@/components/ui";
import { api, ApiError, toQuery } from "@/lib/client/api";
import {
  ALERT_STATUS_LABELS,
  ALERT_STATUS_STYLES,
  cn,
  formatDateTime,
  formatRelative,
  SEVERITY_LABELS,
  SEVERITY_STYLES,
  THREAT_TYPE_LABELS,
} from "@/lib/format";
import { PERMISSIONS } from "@/lib/auth/rbac";
import type { AlertStatus, Severity } from "@/lib/types";

type Alert = {
  id: string;
  type: string;
  title: string;
  description: string;
  severity: Severity;
  status: AlertStatus;
  sourceIp: string | null;
  target: string | null;
  deviceName: string | null;
  riskScore: number;
  detectedAt: string;
  resolvedByName: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
};

type AlertStats = { total: number; open: number; critical: number; resolved: number };

export default function AlertsPage() {
  const { allowed } = useSession();
  const toast = useToast();
  const canManage = allowed(PERMISSIONS.alertsManage);

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [stats, setStats] = useState<AlertStats>({ total: 0, open: 0, critical: 0, resolved: 0 });
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Alert | null>(null);
  const [note, setNote] = useState("");
  const [isolate, setIsolate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ alerts: Alert[]; stats: AlertStats }>(`/api/alerts${toQuery({ status, severity, q: search, limit: 120 })}`);
      setAlerts(data.alerts);
      setStats(data.stats);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "تعذر تحميل التنبيهات.");
    } finally {
      setLoading(false);
    }
  }, [status, severity, search]);

  useEffect(() => {
    load();
  }, [load]);

  const updateAlert = async (id: string, patch: Record<string, unknown>, message: string) => {
    setBusy(true);
    try {
      await api.patch(`/api/alerts/${id}`, patch);
      toast.push("success", message);
      setSelected(null);
      setNote("");
      setIsolate(false);
      await load();
    } catch (caught) {
      toast.push("error", caught instanceof ApiError ? caught.message : "تعذر تحديث التنبيه.");
    } finally {
      setBusy(false);
    }
  };

  const removeAlert = async (alert: Alert) => {
    setBusy(true);
    try {
      await api.delete(`/api/alerts/${alert.id}`);
      toast.push("success", `تم حذف التنبيه «${alert.title}». وسُجّل الإجراء في سجل العمليات.`);
      setSelected(null);
      await load();
    } catch (caught) {
      toast.push("error", caught instanceof ApiError ? caught.message : "تعذر حذف التنبيه.");
    } finally {
      setBusy(false);
    }
  };

  const grouped = useMemo(() => {
    const order: Severity[] = ["critical", "high", "medium", "low"];
    return [...alerts].sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
  }, [alerts]);

  return (
    <div className="space-y-5">
      {/* ------------------------------- المؤشرات ------------------------------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="إجمالي التنبيهات" value={stats.total} icon="alerts" tone="cyan" />
        <SummaryCard label="مفتوحة الآن" value={stats.open} icon="warning" tone="amber" hint="تحتاج إجراءً" />
        <SummaryCard label="حرجة مفتوحة" value={stats.critical} icon="virus" tone="rose" hint="أولوية قصوى" />
        <SummaryCard label="تمت المعالجة" value={stats.resolved} icon="check" tone="mint" hint={`نسبة ${stats.total ? Math.round((stats.resolved / stats.total) * 100) : 0}%`} />
      </div>

      <Panel
        title="سجل التنبيهات الأمنية"
        subtitle="مرتبة حسب الخطورة ثم التوقيت"
        icon="radar"
        actions={
          <>
            <a href={`/api/alerts/export${toQuery({ severity })}`} className="btn-ghost px-3 py-1.5 text-[11px]" download>
              <Icon name="download" className="h-3.5 w-3.5" />
              تصدير CSV
            </a>
            {canManage && (
              <Button variant="primary" icon="plus" className="px-3 py-1.5 text-[11px]" onClick={() => setCreateOpen(true)}>
                تنبيه جديد
              </Button>
            )}
            <Button variant="ghost" icon="refresh" className="px-3 py-1.5 text-[11px]" onClick={load}>
              تحديث
            </Button>
          </>
        }
      >
        {/* الفلاتر */}
        <div className="mb-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="الحالة">
            <select className="field" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">كل الحالات</option>
              {(Object.keys(ALERT_STATUS_LABELS) as AlertStatus[]).map((key) => (
                <option key={key} value={key}>
                  {ALERT_STATUS_LABELS[key]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="الخطورة">
            <select className="field" value={severity} onChange={(event) => setSeverity(event.target.value)}>
              <option value="">كل المستويات</option>
              {(Object.keys(SEVERITY_LABELS) as Severity[]).map((key) => (
                <option key={key} value={key}>
                  {SEVERITY_LABELS[key]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="بحث" className="sm:col-span-2">
            <div className="relative">
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                <Icon name="search" className="h-4 w-4" />
              </span>
              <input className="field pr-10" placeholder="ابحث في العنوان أو الوصف أو عنوان IP..." value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
          </Field>
        </div>

        {loading && alerts.length === 0 ? (
          <LoadingBlock label="جارٍ تحميل التنبيهات..." />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : grouped.length === 0 ? (
          <EmptyState icon="shield" title="لا توجد تنبيهات مطابقة" hint="جرّب تعديل الفلاتر أو أعد التحميل." />
        ) : (
          <ul className="space-y-2.5">
            {grouped.map((alert) => (
              <li key={alert.id}>
                <button
                  onClick={() => setSelected(alert)}
                  className="panel w-full p-3.5 text-right transition hover:border-cyan-400/30"
                >
                  <div className="flex flex-wrap items-start gap-3">
                    <span
                      className={cn(
                        "grid h-9 w-9 shrink-0 place-items-center rounded-xl border",
                        alert.severity === "critical"
                          ? "border-rose-500/40 bg-rose-500/12 text-rose-300"
                          : alert.severity === "high"
                            ? "border-orange-500/40 bg-orange-500/12 text-orange-300"
                            : alert.severity === "medium"
                              ? "border-amber-500/35 bg-amber-500/10 text-amber-300"
                              : "border-sky-500/30 bg-sky-500/10 text-sky-300",
                      )}
                    >
                      <Icon name={alert.severity === "low" ? "info" : "warning"} className="h-4 w-4" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[13px] font-bold text-white">{alert.title}</p>
                        <Badge className={SEVERITY_STYLES[alert.severity]}>{SEVERITY_LABELS[alert.severity]}</Badge>
                        <Badge className={ALERT_STATUS_STYLES[alert.status]} dot={alert.status === "new"}>
                          {ALERT_STATUS_LABELS[alert.status]}
                        </Badge>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-400">{alert.description}</p>
                      <p className="mono mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <LiveDot tone={alert.severity === "critical" ? "rose" : "cyan"} />
                          {THREAT_TYPE_LABELS[alert.type] ?? alert.type}
                        </span>
                        <span dir="ltr">{alert.sourceIp ?? "—"}</span>
                        {alert.target && <span>الهدف: {alert.target}</span>}
                        {alert.deviceName && <span>الجهاز: {alert.deviceName}</span>}
                        <span>{formatRelative(alert.detectedAt)}</span>
                      </p>
                    </div>

                    <div className="w-full shrink-0 sm:w-32">
                      <p className="mono mb-1 text-[9px] text-slate-500">درجة الخطورة</p>
                      <RiskBar value={alert.riskScore} />
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* ------------------------------ تفاصيل التنبيه ----------------------------- */}
      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.title ?? ""}
        subtitle={selected ? `${THREAT_TYPE_LABELS[selected.type] ?? selected.type} • ${formatDateTime(selected.detectedAt)}` : undefined}
        icon="alerts"
        size="lg"
        footer={
          canManage && selected ? (
            <>
              <Button variant="danger" icon="trash" loading={busy} onClick={() => removeAlert(selected)}>
                حذف
              </Button>
              <Button variant="ghost" icon="info" loading={busy} onClick={() => updateAlert(selected.id, { status: "false_positive", resolutionNote: note || "صُنّف كإنذار كاذب بعد المراجعة." }, "تم تصنيف التنبيه كإنذار كاذب.")}>
                إنذار كاذب
              </Button>
              <Button variant="ghost" icon="radar" loading={busy} onClick={() => updateAlert(selected.id, { status: "investigating" }, "تم تحويل التنبيه إلى قيد التحقيق.")}>
                بدء التحقيق
              </Button>
              <Button variant="soft" icon="check" loading={busy} onClick={() => updateAlert(selected.id, { status: "resolved", resolutionNote: note, isolateDevice: isolate }, "تم إغلاق التنبيه ومعالجته.")}>
                معالجة وإغلاق
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={() => setSelected(null)}>
              إغلاق
            </Button>
          )
        }
      >
        {selected && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge className={SEVERITY_STYLES[selected.severity]}>خطورة: {SEVERITY_LABELS[selected.severity]}</Badge>
              <Badge className={ALERT_STATUS_STYLES[selected.status]}>الحالة: {ALERT_STATUS_LABELS[selected.status]}</Badge>
              <Badge className="border-white/10 bg-white/5 text-slate-300">درجة الخطورة: {selected.riskScore}/100</Badge>
            </div>

            <p className="rounded-xl border border-white/8 bg-white/3 p-3.5 text-[12px] leading-relaxed text-slate-300">{selected.description}</p>

            <dl className="grid gap-2.5 sm:grid-cols-2">
              <InfoCell label="مصدر الهجوم" value={selected.sourceIp ?? "—"} mono />
              <InfoCell label="الهدف" value={selected.target ?? "—"} />
              <InfoCell label="الجهاز المتأثر" value={selected.deviceName ?? "—"} />
              <InfoCell label="وقت الرصد" value={formatDateTime(selected.detectedAt)} />
              {selected.resolvedByName && <InfoCell label="عالجه" value={selected.resolvedByName} />}
              {selected.resolvedAt && <InfoCell label="وقت المعالجة" value={formatDateTime(selected.resolvedAt)} />}
            </dl>

            {selected.resolutionNote && (
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/8 p-3.5">
                <p className="mono mb-1 text-[10px] font-bold text-emerald-300">ملاحظة المعالجة</p>
                <p className="text-[12px] leading-relaxed text-emerald-100">{selected.resolutionNote}</p>
              </div>
            )}

            {canManage && selected.status !== "resolved" && (
              <div className="space-y-3 rounded-xl border border-white/8 bg-abyss-850/60 p-3.5">
                <p className="mono text-[10px] font-bold uppercase tracking-widest text-slate-400">إجراء الاستجابة</p>
                <Field label="ملاحظة المعالجة" hint="تُحفظ في السجل والتقرير">
                  <textarea
                    className="field min-h-20 resize-y"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="مثال: تم حظر عنوان المصدر على الجدار الناري وتحديث قواعد المنع..."
                  />
                </Field>
                {selected.deviceName && (
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-rose-500/25 bg-rose-500/8 p-3 text-[11px] text-rose-100">
                    <input type="checkbox" checked={isolate} onChange={(event) => setIsolate(event.target.checked)} className="h-4 w-4 accent-rose-400" />
                    <span>
                      عزل الجهاز <b>{selected.deviceName}</b> عن الشبكة تلقائياً (يرفع درجة خطورته ويوقف اتصاله).
                    </span>
                  </label>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      <CreateAlertModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={load} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function InfoCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/3 p-3">
      <dt className="mono text-[10px] text-slate-500">{label}</dt>
      <dd className={cn("mt-1 text-[12px] text-slate-200", mono && "mono")} dir={mono ? "ltr" : undefined}>
        {value}
      </dd>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  tone,
  hint,
}: {
  label: string;
  value: number;
  icon: "alerts" | "warning" | "virus" | "check";
  tone: "cyan" | "amber" | "rose" | "mint";
  hint?: string;
}) {
  const tones = {
    cyan: "border-cyan-400/25 text-cyan-300",
    amber: "border-amber-400/25 text-amber-300",
    rose: "border-rose-400/25 text-rose-300",
    mint: "border-emerald-400/25 text-emerald-300",
  };
  return (
    <div className={cn("panel p-3.5", tones[tone])}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] text-slate-400">{label}</p>
          <p className="stat-value mt-1">{value}</p>
          {hint && <p className="mono mt-1 text-[9px] text-slate-500">{hint}</p>}
        </div>
        <span className={cn("grid h-9 w-9 place-items-center rounded-xl border bg-white/4", tones[tone])}>
          <Icon name={icon} className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                          نافذة إنشاء تنبيه يدوي                             */
/* -------------------------------------------------------------------------- */

function CreateAlertModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ title: "", description: "", severity: "medium" as Severity, type: "unauthorized_access", sourceIp: "", target: "", deviceName: "" });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api.post("/api/alerts", form);
      toast.push("success", "تم إنشاء التنبيه وتسجيله في سجل العمليات.");
      onClose();
      onCreated();
    } catch (caught) {
      toast.push("error", caught instanceof ApiError ? caught.message : "تعذر إنشاء التنبيه.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="إنشاء تنبيه أمني"
      subtitle="يُسجَّل فوراً ويظهر في اللوحة والتقارير"
      icon="plus"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" icon="check" loading={busy} onClick={submit}>
            إنشاء التنبيه
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Field label="العنوان">
          <input className="field" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="مثال: نشاط مشبوه على خادم الملفات" />
        </Field>
        <Field label="الوصف التفصيلي">
          <textarea className="field min-h-24 resize-y" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="اذكر ما تم رصده والإجراء المقترح..." />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="الخطورة">
            <select className="field" value={form.severity} onChange={(event) => setForm({ ...form, severity: event.target.value as Severity })}>
              {(Object.keys(SEVERITY_LABELS) as Severity[]).map((key) => (
                <option key={key} value={key}>
                  {SEVERITY_LABELS[key]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="نوع التهديد">
            <select className="field" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
              {Object.entries(THREAT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="عنوان IP المصدر" hint="اختياري">
            <input className="field" dir="ltr" value={form.sourceIp} onChange={(event) => setForm({ ...form, sourceIp: event.target.value })} placeholder="203.0.113.45" />
          </Field>
          <Field label="الهدف / الجهاز" hint="اختياري">
            <input className="field" value={form.deviceName} onChange={(event) => setForm({ ...form, deviceName: event.target.value })} placeholder="خادم الملفات" />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
