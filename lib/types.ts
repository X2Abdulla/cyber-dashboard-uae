/**
 * ============================================================================
 *  الأنواع المشتركة بين الخادم والواجهة
 * ============================================================================
 */

/** أدوار الصلاحيات في النظام. */
export type Role = "admin" | "supervisor" | "user";

/** المستخدم داخل الجلسة (بدون أي بيانات حساسة). */
export type SessionUser = {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: Role;
  department: string | null;
};

export type Severity = "low" | "medium" | "high" | "critical";
export type AlertStatus = "new" | "investigating" | "resolved" | "false_positive";
export type FileVerdict = "clean" | "suspicious" | "malicious";
export type DeviceStatus = "online" | "offline" | "quarantined";
export type ReportPeriod = "daily" | "weekly" | "monthly";

/** نقطة في سلسلة زمنية للرسوم البيانية. */
export type MetricPoint = { time: string; value: number };

/** استجابة موحدة لكل واجهات البرمجة. */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };
