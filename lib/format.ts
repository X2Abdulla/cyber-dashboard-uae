/**
 * ============================================================================
 *  أدوات التنسيق العربية المشتركة (تُستخدم في الخادم والواجهة)
 * ============================================================================
 */
import type { AlertStatus, DeviceStatus, FileVerdict, ReportPeriod, Role, Severity } from "@/lib/types";

/** دمج أصناف Tailwind بشكل آمن. */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

const AR_DATE = new Intl.DateTimeFormat("ar-EG", {
  dateStyle: "medium",
  timeStyle: "short",
  numberingSystem: "latn",
});

const AR_TIME = new Intl.DateTimeFormat("ar-EG", {
  hour: "2-digit",
  minute: "2-digit",
  numberingSystem: "latn",
});

const AR_DAY = new Intl.DateTimeFormat("ar-EG", {
  month: "short",
  day: "numeric",
  numberingSystem: "latn",
});

/** تاريخ ووقت كامل. */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return AR_DATE.format(new Date(value));
}

/** الوقت فقط (HH:mm). */
export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return AR_TIME.format(new Date(value));
}

/** تاريخ مختصر للمحاور. */
export function formatShortDay(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return AR_DAY.format(new Date(value));
}

/** وقت نسبي عربي (منذ 5 دقائق). */
export function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const target = new Date(value).getTime();
  const diffSeconds = Math.round((Date.now() - target) / 1000);
  if (Number.isNaN(diffSeconds)) return "—";
  if (diffSeconds < 10) return "الآن";
  if (diffSeconds < 60) return `منذ ${diffSeconds} ثانية`;
  const minutes = Math.round(diffSeconds / 60);
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.round(hours / 24);
  if (days < 30) return `منذ ${days} يوم`;
  return formatDateTime(value);
}

/** تنسيق حجم الملف. */
export function formatBytes(bytes: number): string {
  if (!bytes) return "0 بايت";
  const units = ["بايت", "ك.ب", "م.ب", "ج.ب", "ت.ب"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

/** تنسيق الأرقام بفواصل الآلاف. */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

/* ------------------------------- التسميات ------------------------------- */

export const SEVERITY_LABELS: Record<Severity, string> = {
  low: "منخفضة",
  medium: "متوسطة",
  high: "عالية",
  critical: "حرجة",
};

export const SEVERITY_STYLES: Record<Severity, string> = {
  low: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  medium: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  high: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  critical: "bg-rose-500/15 text-rose-300 border-rose-500/40",
};

export const ALERT_STATUS_LABELS: Record<AlertStatus, string> = {
  new: "جديد",
  investigating: "قيد التحقيق",
  resolved: "تمت المعالجة",
  false_positive: "إنذار كاذب",
};

export const ALERT_STATUS_STYLES: Record<AlertStatus, string> = {
  new: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  investigating: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  resolved: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  false_positive: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

export const VERDICT_LABELS: Record<FileVerdict, string> = {
  clean: "سليم",
  suspicious: "مشبوه",
  malicious: "ضار",
};

export const VERDICT_STYLES: Record<FileVerdict, string> = {
  clean: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  suspicious: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  malicious: "bg-rose-500/15 text-rose-300 border-rose-500/40",
};

export const DEVICE_STATUS_LABELS: Record<DeviceStatus, string> = {
  online: "متصل",
  offline: "غير متصل",
  quarantined: "معزول",
};

export const DEVICE_STATUS_STYLES: Record<DeviceStatus, string> = {
  online: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  offline: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  quarantined: "bg-rose-500/15 text-rose-300 border-rose-500/40",
};

export const PERIOD_LABELS: Record<ReportPeriod, string> = {
  daily: "يومي",
  weekly: "أسبوعي",
  monthly: "شهري",
};

export const ROLE_LABELS_MAP: Record<Role, string> = {
  admin: "مدير النظام",
  supervisor: "مشرف أمني",
  user: "مستخدم",
};

export const ROLE_STYLES: Record<Role, string> = {
  admin: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  supervisor: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  user: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

/** أسماء عربية لأنواع التهديدات. */
export const THREAT_TYPE_LABELS: Record<string, string> = {
  brute_force: "قوة غاشمة",
  malware: "برمجية خبيثة",
  phishing: "تصيّد احتيالي",
  port_scan: "مسح منافذ",
  ddos: "هجوم حجب خدمة",
  data_exfiltration: "تسريب بيانات",
  unauthorized_access: "وصول غير مصرح",
  weak_policy: "مخالفة سياسة",
  ransomware: "فدية",
  sql_injection: "حقن SQL",
  xss: "حقن سكربت",
  insider_threat: "تهديد داخلي",
};

/** أسماء عربية لأنواع الأجهزة. */
export const DEVICE_TYPE_LABELS: Record<string, string> = {
  server: "خادم",
  workstation: "محطة عمل",
  router: "موجه/جدار ناري",
  camera: "كاميرا مراقبة",
  iot: "جهاز إنترنت أشياء",
  mobile: "جهاز محمول",
};
