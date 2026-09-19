"use client";

/**
 * ============================================================================
 *  سجل العمليات (Audit Log) — تدقيق كامل وغير قابل للتجاهل
 * ============================================================================
 *  فلاتر: التصنيف، النتيجة، البحث، النطاق الزمني + ترقيم صفحات + تصدير CSV.
 *  كل محاولة وصول مرفوضة أو عملية محظورة تظهر هنا بلون مميز.
 */
import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { Badge, Button, EmptyState, ErrorState, Field, LoadingBlock, Modal, Pagination, Panel, useToast } from "@/components/ui";
import { api, ApiError, toQuery } from "@/lib/client/api";
import { cn, formatDateTime, formatNumber, formatRelative } from "@/lib/format";

type AuditEntry = {
  id: string;
  username: string | null;
  category: string;
  action: string;
  description: string;
  status: "success" | "failure" | "blocked";
  ip: string | null;
  userAgent: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
};

type Summary = { success: number; failure: number; blocked: number; total: number };

const CATEGORIES: { value: string; label: string }[] = [
  { value: "auth", label: "المصادقة" },
  { value: "files", label: "الملفات" },
  { value: "alerts", label: "التنبيهات" },
  { value: "users", label: "المستخدمون" },
  { value: "devices", label: "الأجهزة" },
  { value: "reports", label: "التقارير" },
  { value: "system", label: "النظام" },
];

const STATUS_LABELS: Record<AuditEntry["status"], string> = { success: "نجاح", failure: "فشل", blocked: "محظور" };
const STATUS_STYLES: Record<AuditEntry["status"], string> = {
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  failure: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  blocked: "border-rose-500/35 bg-rose-500/12 text-rose-200",
};

export default function AuditPage() {
  const toast = useToast();
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [summary, setSummary] = useState<Summary>({ success: 0, failure: 0, blocked: 0, total: 0 });
  const [pagination, setPagination] = useState({ page: 1, pageSize: 25, total: 0, pages: 1 });
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [hours, setHours] = useState("0");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  const load = useCallback(
    async (page = pagination.page) => {
      setLoading(true);
      try {
        const data = await api.get<{ logs: AuditEntry[]; summary: Summary; pagination: typeof pagination }>(
          `/api/audit${toQuery({ category, status, q: search, hours: hours === "0" ? "" : hours, page, pageSize: pagination.pageSize })}`,
        );
        setLogs(data.logs);
        setSummary(data.summary);
        setPagination(data.pagination);
        setError(null);
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : "تعذر تحميل سجل العمليات.");
      } finally {
        setLoading(false);
      }
    },
    [category, status, search, hours, pagination.page, pagination.pageSize],
  );

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, status, search, hours]);

  const exportCsv = () => {
    toast.push("info", "جارٍ تجهيز ملف التصدير CSV...");
    window.location.href = `/api/audit/export${toQuery({ status })}`;
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AuditStat label="إجمالي العمليات" value={summary.total} tone="cyan" icon="audit" />
        <AuditStat label="عمليات ناجحة" value={summary.success} tone="mint" icon="check" />
        <AuditStat label="محاولات فاشلة" value={summary.failure} tone="amber" icon="warning" />
        <AuditStat label="عمليات محظورة" value={summary.blocked} tone="rose" icon="lock" />
      </div>

      <Panel
        title="سجل العمليات الكامل"
        subtitle="كل إجراء في النظام موثّق بالمستخدم وعنوان IP والتوقيت والنتيجة"
        icon="audit"
        actions={
          <>
            <Button variant="ghost" icon="download" className="px-3 py-1.5 text-[11px]" onClick={exportCsv}>
              تصدير CSV
            </Button>
            <Button variant="ghost" icon="print" className="px-3 py-1.5 text-[11px]" onClick={() => window.print()}>
              طباعة
            </Button>
            <Button variant="ghost" icon="refresh" className="px-3 py-1.5 text-[11px]" onClick={() => load(pagination.page)}>
              تحديث
            </Button>
          </>
        }
      >
        <div className="mb-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="التصنيف">
            <select className="field" value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="">كل التصنيفات</option>
              {CATEGORIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="النتيجة">
            <select className="field" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">كل النتائج</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="النطاق الزمني">
            <select className="field" value={hours} onChange={(event) => setHours(event.target.value)}>
              <option value="0">كل الفترات</option>
              <option value="1">آخر ساعة</option>
              <option value="24">آخر 24 ساعة</option>
              <option value="168">آخر أسبوع</option>
              <option value="720">آخر 30 يوماً</option>
            </select>
          </Field>
          <Field label="بحث">
            <div className="relative">
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                <Icon name="search" className="h-4 w-4" />
              </span>
              <input className="field pr-10" placeholder="مستخدم / وصف / IP" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
          </Field>
        </div>

        {loading && logs.length === 0 ? (
          <LoadingBlock label="جارٍ تحميل السجل..." />
        ) : error ? (
          <ErrorState message={error} onRetry={() => load(1)} />
        ) : logs.length === 0 ? (
          <EmptyState icon="audit" title="لا توجد عمليات مطابقة" hint="غيّر الفلاتر أو وسّع النطاق الزمني." />
        ) : (
          <>
            {/* عرض جدولي على الشاشات الكبيرة */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-right">
                <thead className="table-head">
                  <tr>
                    <th className="px-3 py-2.5">التوقيت</th>
                    <th className="px-3 py-2.5">المستخدم</th>
                    <th className="px-3 py-2.5">التصنيف</th>
                    <th className="px-3 py-2.5">العملية</th>
                    <th className="px-3 py-2.5">الوصف</th>
                    <th className="px-3 py-2.5">IP</th>
                    <th className="px-3 py-2.5">النتيجة</th>
                  </tr>
                </thead>
                <tbody className="text-[11px]">
                  {logs.map((entry) => (
                    <tr key={entry.id} className="table-row cursor-pointer" onClick={() => setSelected(entry)}>
                      <td className="mono whitespace-nowrap px-3 py-2.5 text-slate-400">{formatDateTime(entry.createdAt)}</td>
                      <td className="px-3 py-2.5 font-semibold text-slate-200">{entry.username ?? "system"}</td>
                      <td className="px-3 py-2.5 text-slate-400">{CATEGORIES.find((item) => item.value === entry.category)?.label ?? entry.category}</td>
                      <td className="mono px-3 py-2.5 text-cyan-300" dir="ltr">
                        {entry.action}
                      </td>
                      <td className="max-w-xs truncate px-3 py-2.5 text-slate-300">{entry.description}</td>
                      <td className="mono px-3 py-2.5 text-slate-500" dir="ltr">
                        {entry.ip ?? "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge className={STATUS_STYLES[entry.status]}>{STATUS_LABELS[entry.status]}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* عرض بطاقات على الجوال */}
            <ul className="space-y-2 lg:hidden">
              {logs.map((entry) => (
                <li key={entry.id}>
                  <button onClick={() => setSelected(entry)} className="panel w-full p-3 text-right">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-semibold text-slate-100">{entry.description}</p>
                        <p className="mono mt-1 truncate text-[10px] text-slate-500">
                          {entry.username ?? "system"} • {entry.action} • {formatRelative(entry.createdAt)}
                        </p>
                      </div>
                      <Badge className={cn("shrink-0", STATUS_STYLES[entry.status])}>{STATUS_LABELS[entry.status]}</Badge>
                    </div>
                  </button>
                </li>
              ))}
            </ul>

            <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} onChange={(page) => load(page)} />
          </>
        )}
      </Panel>

      <Modal open={selected !== null} onClose={() => setSelected(null)} title="تفاصيل العملية" subtitle={selected?.action} icon="audit">
        {selected && (
          <div className="space-y-3">
            <dl className="grid gap-2.5 sm:grid-cols-2">
              <Cell label="المعرف" value={selected.id} mono />
              <Cell label="المستخدم" value={selected.username ?? "system"} />
              <Cell label="التصنيف" value={CATEGORIES.find((item) => item.value === selected.category)?.label ?? selected.category} />
              <Cell label="النتيجة" value={STATUS_LABELS[selected.status]} />
              <Cell label="عنوان IP" value={selected.ip ?? "—"} mono />
              <Cell label="التوقيت" value={formatDateTime(selected.createdAt)} />
            </dl>
            <div className="rounded-xl border border-white/8 bg-white/3 p-3">
              <p className="mono mb-1 text-[10px] text-slate-500">الوصف</p>
              <p className="text-[12px] leading-relaxed text-slate-200">{selected.description}</p>
            </div>
            <div className="rounded-xl border border-white/8 bg-white/3 p-3">
              <p className="mono mb-1 text-[10px] text-slate-500">وكيل المستخدم</p>
              <p className="mono break-all text-[10px] leading-relaxed text-slate-400" dir="ltr">
                {selected.userAgent ?? "—"}
              </p>
            </div>
            {selected.meta && (
              <div className="rounded-xl border border-white/8 bg-abyss-850/70 p-3">
                <p className="mono mb-1 text-[10px] text-slate-500">بيانات إضافية (JSON)</p>
                <pre className="mono max-h-56 overflow-auto whitespace-pre-wrap break-all text-[10px] leading-relaxed text-cyan-200" dir="ltr">
                  {JSON.stringify(selected.meta, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function Cell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/3 p-3">
      <dt className="mono text-[10px] text-slate-500">{label}</dt>
      <dd className={cn("mt-1 break-all text-[12px] text-slate-200", mono && "mono")} dir={mono ? "ltr" : undefined}>
        {value}
      </dd>
    </div>
  );
}

function AuditStat({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: "cyan" | "mint" | "amber" | "rose";
  icon: "audit" | "check" | "warning" | "lock";
}) {
  const tones = {
    cyan: "border-cyan-400/25 text-cyan-300",
    mint: "border-emerald-400/25 text-emerald-300",
    amber: "border-amber-400/25 text-amber-300",
    rose: "border-rose-400/25 text-rose-300",
  };
  return (
    <div className={cn("panel p-3.5", tones[tone])}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] text-slate-400">{label}</p>
          <p className="stat-value mt-1">{formatNumber(value)}</p>
        </div>
        <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl border bg-white/4", tones[tone])}>
          <Icon name={icon} className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}
