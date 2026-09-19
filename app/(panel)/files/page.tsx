"use client";

/**
 * ============================================================================
 *  إدارة الملفات — رفع + فحص أمني + تصنيف + تصدير/تنزيل
 * ============================================================================
 *  كل ملف يمر بمحرك DERAA-Heuristic قبل التخزين:
 *   - ضار  → يُرفض الرفع نهائياً ويُنشأ تنبيه حرج + قيد في سجل العمليات.
 *   - مشبوه → يُخزَّن ويُعزل تلقائياً ولا يُنزَّل إلا بإذن المشرف.
 *   - سليم  → يُخزَّن ويُصنَّف تلقائياً (مالي/شخصي/طبي/تقني/عقود/عام).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/components/session-context";
import { Icon } from "@/components/icons";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  LoadingBlock,
  Modal,
  Panel,
  RiskBar,
  useToast,
} from "@/components/ui";
import { api, ApiError, toQuery } from "@/lib/client/api";
import { cn, formatBytes, formatDateTime, formatNumber, formatRelative, VERDICT_LABELS, VERDICT_STYLES } from "@/lib/format";
import { PERMISSIONS } from "@/lib/auth/rbac";
import type { FileVerdict } from "@/lib/types";

type ScanDetection = { rule: string; severity: string; detail: string; points: number };

type ScanReport = {
  verdict: FileVerdict;
  threatScore: number;
  detections: ScanDetection[];
  realType: string;
  extensionMismatch: boolean;
  classification: string;
  sensitivity: string;
  sha256: string;
  engine: string;
  scannedAt: string;
  durationMs: number;
};

type FileRow = {
  id: string;
  originalName: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  sha256: string;
  verdict: FileVerdict;
  threatScore: number;
  classification: string;
  sensitivity: string;
  quarantined: boolean;
  downloadCount: number;
  uploadedByName: string | null;
  createdAt: string;
  scanReport: ScanReport | null;
};

type FileStats = { total: number; clean: number; suspicious: number; malicious: number; quarantined: number; size: number };

const CLASSIFICATIONS = ["عام", "مالي", "شخصي", "طبي", "عقود", "تقني", "موارد بشرية"];
const SENSITIVITY_LEVELS = ["عام", "خاص", "سري"];

export default function FilesPage() {
  const { allowed, user } = useSession();
  const toast = useToast();
  const canUpload = allowed(PERMISSIONS.filesUpload);
  const canDownload = allowed(PERMISSIONS.filesDownload);
  const canQuarantine = allowed(PERMISSIONS.filesQuarantine);
  const canDelete = allowed(PERMISSIONS.filesDelete);

  const [files, setFiles] = useState<FileRow[]>([]);
  const [stats, setStats] = useState<FileStats>({ total: 0, clean: 0, suspicious: 0, malicious: 0, quarantined: 0, size: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState("");
  const [search, setSearch] = useState("");
  const [quarantineOnly, setQuarantineOnly] = useState(false);
  const [selected, setSelected] = useState<FileRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ files: FileRow[]; stats: FileStats }>(
        `/api/files${toQuery({ verdict, q: search, quarantined: quarantineOnly ? "true" : "" })}`,
      );
      setFiles(data.files);
      setStats(data.stats);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "تعذر تحميل الملفات.");
    } finally {
      setLoading(false);
    }
  }, [verdict, search, quarantineOnly]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleQuarantine = async (file: FileRow, next: boolean) => {
    setBusy(true);
    try {
      await api.patch(`/api/files/${file.id}`, { quarantined: next });
      toast.push("success", next ? `تم عزل الملف «${file.originalName}».` : `تم إخراج «${file.originalName}» من العزل.`);
      setSelected(null);
      await load();
    } catch (caught) {
      toast.push("error", caught instanceof ApiError ? caught.message : "تعذر تحديث حالة العزل.");
    } finally {
      setBusy(false);
    }
  };

  const removeFile = async (file: FileRow) => {
    setBusy(true);
    try {
      await api.delete(`/api/files/${file.id}`);
      toast.push("success", `تم حذف «${file.originalName}» نهائياً.`);
      setSelected(null);
      await load();
    } catch (caught) {
      toast.push("error", caught instanceof ApiError ? caught.message : "تعذر حذف الملف.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* ------------------------------- المؤشرات ------------------------------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <FileStat label="إجمالي الملفات" value={formatNumber(stats.total)} icon="files" tone="cyan" hint={formatBytes(stats.size)} />
        <FileStat label="سليمة" value={formatNumber(stats.clean)} icon="check" tone="mint" />
        <FileStat label="مشبوهة" value={formatNumber(stats.suspicious)} icon="warning" tone="amber" />
        <FileStat label="ضارة/محجوزة" value={formatNumber(stats.malicious)} icon="virus" tone="rose" />
        <FileStat label="قيد العزل" value={formatNumber(stats.quarantined)} icon="lock" tone="violet" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.6fr]">
        {/* ------------------------------ منطقة الرفع ----------------------------- */}
        {canUpload ? (
          <UploadPanel onUploaded={load} defaultUser={user.fullName} />
        ) : (
          <Panel title="رفع الملفات" icon="upload">
            <EmptyState icon="lock" title="لا تملك صلاحية الرفع" hint="دورك الحالي يسمح بالعرض والتنزيل فقط." />
          </Panel>
        )}

        {/* -------------------------------- القائمة ------------------------------- */}
        <Panel
          title="مخزن الملفات المفحوصة"
          subtitle="مرتبة حسب الأحدث — اضغط أي ملف لعرض تقرير الفحص الكامل"
          icon="files"
          actions={
            <Button variant="ghost" icon="refresh" className="px-3 py-1.5 text-[11px]" onClick={load}>
              تحديث
            </Button>
          }
        >
          <div className="mb-4 grid gap-2.5 sm:grid-cols-[1fr_auto_auto]">
            <div className="relative">
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                <Icon name="search" className="h-4 w-4" />
              </span>
              <input className="field pr-10" placeholder="ابحث باسم الملف أو التصنيف..." value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <select className="field sm:w-40" value={verdict} onChange={(event) => setVerdict(event.target.value)}>
              <option value="">كل الأحكام</option>
              {(Object.keys(VERDICT_LABELS) as FileVerdict[]).map((key) => (
                <option key={key} value={key}>
                  {VERDICT_LABELS[key]}
                </option>
              ))}
            </select>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-abyss-850/70 px-3 py-2 text-[11px] text-slate-300">
              <input type="checkbox" checked={quarantineOnly} onChange={(event) => setQuarantineOnly(event.target.checked)} className="h-4 w-4 accent-cyan-400" />
              المعزولة فقط
            </label>
          </div>

          {loading && files.length === 0 ? (
            <LoadingBlock label="جارٍ تحميل المخزن..." />
          ) : error ? (
            <ErrorState message={error} onRetry={load} />
          ) : files.length === 0 ? (
            <EmptyState icon="files" title="لا توجد ملفات مطابقة" hint="ارفع ملفاً جديداً ليخضع للفحص الأمني الفوري." />
          ) : (
            <ul className="space-y-2">
              {files.map((file) => (
                <li key={file.id}>
                  <button onClick={() => setSelected(file)} className="panel w-full p-3 text-right transition hover:border-cyan-400/30">
                    <div className="flex flex-wrap items-center gap-3">
                      <span
                        className={cn(
                          "grid h-9 w-9 shrink-0 place-items-center rounded-xl border",
                          file.verdict === "clean"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                            : file.verdict === "suspicious"
                              ? "border-amber-500/35 bg-amber-500/10 text-amber-300"
                              : "border-rose-500/40 bg-rose-500/12 text-rose-300",
                        )}
                      >
                        <Icon name={file.verdict === "clean" ? "check" : file.verdict === "suspicious" ? "warning" : "virus"} className="h-4 w-4" />
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="truncate text-[12px] font-bold text-white">{file.originalName}</p>
                          {file.quarantined && (
                            <Badge className="border-rose-500/35 bg-rose-500/12 text-rose-200" dot>
                              معزول
                            </Badge>
                          )}
                        </div>
                        <p className="mono mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-slate-500">
                          <span>{formatBytes(file.sizeBytes)}</span>
                          <span>{file.classification}</span>
                          <span className="text-slate-400">{file.sensitivity}</span>
                          <span>{file.uploadedByName ?? "—"}</span>
                          <span>{formatRelative(file.createdAt)}</span>
                          <span>تنزيلات: {file.downloadCount}</span>
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <Badge className={VERDICT_STYLES[file.verdict]}>{VERDICT_LABELS[file.verdict]}</Badge>
                        <div className="hidden w-24 sm:block">
                          <RiskBar value={file.threatScore} />
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* ------------------------------ تفاصيل الملف ------------------------------ */}
      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.originalName ?? ""}
        subtitle={selected ? `${formatBytes(selected.sizeBytes)} • ${formatDateTime(selected.createdAt)}` : undefined}
        icon="files"
        size="lg"
        footer={
          selected ? (
            <>
              {canDelete && (
                <Button variant="danger" icon="trash" loading={busy} onClick={() => removeFile(selected)}>
                  حذف نهائي
                </Button>
              )}
              {canQuarantine && (
                <Button variant="ghost" icon={selected.quarantined ? "unlock" : "lock"} loading={busy} onClick={() => toggleQuarantine(selected, !selected.quarantined)}>
                  {selected.quarantined ? "إخراج من العزل" : "عزل الملف"}
                </Button>
              )}
              {canDownload && (
                <a href={`/api/files/${selected.id}`} className="btn-primary px-4 py-2 text-[13px]" download>
                  <Icon name="download" className="h-4 w-4" />
                  تنزيل آمن
                </a>
              )}
              <Button variant="ghost" onClick={() => setSelected(null)}>
                إغلاق
              </Button>
            </>
          ) : undefined
        }
      >
        {selected && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge className={VERDICT_STYLES[selected.verdict]} dot>
                الحكم: {VERDICT_LABELS[selected.verdict]}
              </Badge>
              <Badge className="border-white/10 bg-white/5 text-slate-300">درجة التهديد: {selected.threatScore}/100</Badge>
              <Badge className="border-cyan-400/25 bg-cyan-400/8 text-cyan-200">التصنيف: {selected.classification}</Badge>
              <Badge className="border-violet-400/25 bg-violet-400/8 text-violet-200">الحساسية: {selected.sensitivity}</Badge>
              {selected.quarantined && <Badge className="border-rose-500/35 bg-rose-500/12 text-rose-200">معزول</Badge>}
            </div>

            {selected.quarantined && (
              <p className="rounded-xl border border-amber-500/30 bg-amber-500/8 p-3 text-[11px] leading-relaxed text-amber-100">
                هذا الملف قيد العزل ولا يمكن تنزيله إلا لمن يملك صلاحية إدارة العزل. راجع تقرير الفحص قبل اتخاذ الإجراء.
              </p>
            )}

            <dl className="grid gap-2.5 sm:grid-cols-2">
              <DetailCell label="النوع الحقيقي (بايتات سحرية)" value={selected.scanReport?.realType ?? selected.mimeType} />
              <DetailCell label="المحرك" value={selected.scanReport?.engine ?? "DERAA-Heuristic"} />
              <DetailCell label="مدة الفحص" value={`${selected.scanReport?.durationMs ?? 0} مللي ثانية`} />
              <DetailCell label="الامتداد" value={`.${selected.extension || "بدون"}`} />
              <DetailCell label="تطابق الامتداد مع المحتوى" value={selected.scanReport?.extensionMismatch ? "لا — انتحال محتمل" : "نعم"} />
              <DetailCell label="رفعه" value={selected.uploadedByName ?? "—"} />
            </dl>

            <div className="rounded-xl border border-white/8 bg-abyss-850/60 p-3.5">
              <p className="mono mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">بصمة SHA-256</p>
              <p className="mono break-all text-[10px] leading-relaxed text-cyan-200" dir="ltr">
                {selected.sha256}
              </p>
            </div>

            <div>
              <p className="mono mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">نتائج قواعد الفحص</p>
              {selected.scanReport && selected.scanReport.detections.length > 0 ? (
                <ul className="space-y-2">
                  {selected.scanReport.detections.map((detection) => (
                    <li key={detection.rule} className="rounded-xl border border-white/8 bg-white/3 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="mono text-[11px] font-bold text-rose-200" dir="ltr">
                          {detection.rule}
                        </span>
                        <Badge
                          className={cn(
                            detection.severity === "critical"
                              ? "border-rose-500/40 bg-rose-500/12 text-rose-200"
                              : detection.severity === "high"
                                ? "border-orange-500/35 bg-orange-500/10 text-orange-200"
                                : detection.severity === "medium"
                                  ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                                  : "border-sky-500/30 bg-sky-500/10 text-sky-200",
                          )}
                        >
                          {detection.severity} +{detection.points}
                        </Badge>
                      </div>
                      <p className="mt-1.5 text-[11px] leading-relaxed text-slate-300">{detection.detail}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-xl border border-emerald-500/25 bg-emerald-500/8 p-3 text-[11px] leading-relaxed text-emerald-100">
                  لم تتطابق أي قاعدة تهديد — الملف سليم وفق سياسات الفحص الحالية.
                </p>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function DetailCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/3 p-3">
      <dt className="mono text-[10px] text-slate-500">{label}</dt>
      <dd className="mt-1 text-[12px] text-slate-200">{value}</dd>
    </div>
  );
}

function FileStat({
  label,
  value,
  icon,
  tone,
  hint,
}: {
  label: string;
  value: string;
  icon: "files" | "check" | "warning" | "virus" | "lock";
  tone: "cyan" | "mint" | "amber" | "rose" | "violet";
  hint?: string;
}) {
  const tones = {
    cyan: "border-cyan-400/25 text-cyan-300",
    mint: "border-emerald-400/25 text-emerald-300",
    amber: "border-amber-400/25 text-amber-300",
    rose: "border-rose-400/25 text-rose-300",
    violet: "border-violet-400/25 text-violet-300",
  };
  return (
    <div className={cn("panel p-3.5", tones[tone])}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] text-slate-400">{label}</p>
          <p className="stat-value mt-1">{value}</p>
          {hint && <p className="mono mt-1 truncate text-[9px] text-slate-500">{hint}</p>}
        </div>
        <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl border bg-white/4", tones[tone])}>
          <Icon name={icon} className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                            لوحة الرفع والفحص                                */
/* -------------------------------------------------------------------------- */

function UploadPanel({ onUploaded, defaultUser }: { onUploaded: () => void; defaultUser: string }) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [classification, setClassification] = useState("");
  const [sensitivity, setSensitivity] = useState("");
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lastResult, setLastResult] = useState<{ verdict: FileVerdict; threatScore: number; detections: ScanDetection[] } | null>(null);

  const reset = () => {
    setFile(null);
    setClassification("");
    setSensitivity("");
    setNote("");
    setProgress(0);
    if (inputRef.current) inputRef.current.value = "";
  };

  const upload = async () => {
    if (!file) {
      toast.push("error", "اختر ملفاً أولاً.");
      return;
    }
    setUploading(true);
    setProgress(10);
    const form = new FormData();
    form.append("file", file);
    if (classification) form.append("classification", classification);
    if (sensitivity) form.append("sensitivity", sensitivity);
    if (note) form.append("note", note);

    // محاكاة تقدم مرحلي لأن fetch لا يوفّر نسبة رفع دقيقة في المتصفح.
    const timer = window.setInterval(() => setProgress((value) => Math.min(88, value + 12)), 220);
    try {
      const result = await api.post<{ file: FileRow; scan: ScanReport }>("/api/files", form);
      window.clearInterval(timer);
      setProgress(100);
      setLastResult({ verdict: result.scan.verdict, threatScore: result.scan.threatScore, detections: result.scan.detections });
      toast.push(
        result.scan.verdict === "clean" ? "success" : "info",
        result.scan.verdict === "clean"
          ? `تم رفع «${file.name}» وفحصه — الحكم: سليم (تصنيف: ${result.file.classification}).`
          : `تم رفع «${file.name}» وعزله تلقائياً — الحكم: مشبوه (درجة ${result.scan.threatScore}).`,
      );
      reset();
      onUploaded();
    } catch (caught) {
      window.clearInterval(timer);
      setProgress(0);
      const apiError = caught instanceof ApiError ? caught : null;
      const scan = (apiError?.payload as { scan?: ScanReport } | undefined)?.scan;
      if (scan) setLastResult({ verdict: scan.verdict, threatScore: scan.threatScore, detections: scan.detections });
      toast.push("error", apiError?.message ?? "تعذر رفع الملف.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Panel title="رفع ملف جديد" subtitle={`الحد الأقصى 10 م.ب • الفحص فوري • الرفع باسم ${defaultUser}`} icon="upload">
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const dropped = event.dataTransfer.files?.[0];
            if (dropped) setFile(dropped);
          }}
          className={cn(
            "relative overflow-hidden rounded-2xl border-2 border-dashed p-6 text-center transition",
            dragging ? "border-cyan-400/70 bg-cyan-400/8" : "border-white/12 bg-white/3",
          )}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-16 animate-scanline bg-gradient-to-b from-cyan-400/12 to-transparent" />
          <span className="relative mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-cyan-400/25 bg-cyan-400/10 text-cyan-300">
            <Icon name="upload" className="h-6 w-6" />
          </span>
          <p className="relative mt-3 text-[13px] font-bold text-white">اسحب الملف هنا أو اختره من جهازك</p>
          <p className="relative mt-1 text-[10px] leading-relaxed text-slate-500">
            الامتدادات التنفيذية (exe, bat, js, sh, apk...) محظورة نهائياً. يتم فحص البايتات السحرية والمحتوى والإنتروبيا.
          </p>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            aria-label="اختيار ملف"
          />
          <div className="relative mt-4 flex flex-wrap items-center justify-center gap-2">
            <Button variant="ghost" icon="files" onClick={() => inputRef.current?.click()}>
              اختيار ملف
            </Button>
            <Button variant="primary" icon="shield" loading={uploading} onClick={upload} disabled={!file}>
              {uploading ? "جارٍ الفحص..." : "رفع وفحص أمني"}
            </Button>
          </div>

          {file && (
            <div className="relative mt-4 rounded-xl border border-cyan-400/25 bg-cyan-400/8 p-3 text-right">
              <p className="truncate text-[12px] font-bold text-cyan-100">{file.name}</p>
              <p className="mono mt-1 text-[10px] text-slate-400">
                {formatBytes(file.size)} • {file.type || "نوع غير محدد"}
              </p>
            </div>
          )}

          {uploading && (
            <div className="relative mt-4">
              <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
                <div className="h-full rounded-full bg-gradient-to-l from-cyan-400 to-violet-400 transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
              <p className="mono mt-1.5 text-[10px] text-slate-400">
                مراحل الفحص: الامتداد ← البايتات السحرية ← قواعد التوقيع ← الإنتروبيا ← التصنيف ({progress}%)
              </p>
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="التصنيف" hint="افتراضي: تلقائي من المحتوى">
            <select className="field" value={classification} onChange={(event) => setClassification(event.target.value)}>
              <option value="">تصنيف تلقائي</option>
              {CLASSIFICATIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </Field>
          <Field label="مستوى الحساسية" hint="افتراضي: تلقائي">
            <select className="field" value={sensitivity} onChange={(event) => setSensitivity(event.target.value)}>
              <option value="">تقييم تلقائي</option>
              {SENSITIVITY_LEVELS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </Field>
          <Field label="ملاحظة" className="sm:col-span-2" hint="اختياري — تُحفظ في سجل العمليات">
            <input className="field" value={note} onChange={(event) => setNote(event.target.value)} placeholder="مثال: تقرير ربع سنوي لقسم المالية" />
          </Field>
        </div>
      </Panel>

      {lastResult && (
        <Panel
          title="نتيجة آخر فحص"
          subtitle={`الحكم: ${VERDICT_LABELS[lastResult.verdict]} — درجة التهديد ${lastResult.threatScore}/100`}
          icon={lastResult.verdict === "clean" ? "check" : "warning"}
        >
          <div className="mb-3">
            <RiskBar value={lastResult.threatScore} />
          </div>
          {lastResult.detections.length > 0 ? (
            <ul className="space-y-1.5">
              {lastResult.detections.map((detection) => (
                <li key={detection.rule} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/8 bg-white/3 px-3 py-2">
                  <span className="mono text-[10px] font-bold text-rose-200" dir="ltr">
                    {detection.rule}
                  </span>
                  <span className="text-[10px] text-slate-300">{detection.detail}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] leading-relaxed text-emerald-200">لم يتم رصد أي مؤشر تهديد. الملف مخزَّن ومشفّر ومفهرس ببصمة SHA-256.</p>
          )}
        </Panel>
      )}
    </div>
  );
}
