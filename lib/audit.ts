/**
 * ============================================================================
 *  سجل التدقيق (Audit Log) — تسجيل كامل للعمليات
 * ============================================================================
 *  كل عملية حساسة في النظام (دخول، رفع ملف، تغيير صلاحية، حذف، تصدير...)
 *  تُسجَّل هنا مع المستخدم و IP ووكيل المستخدم والنتيجة.
 */
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { ensureDbReady } from "@/db/bootstrap";
import type { SessionUser } from "@/lib/types";

export type AuditCategory =
  | "auth"
  | "files"
  | "alerts"
  | "users"
  | "devices"
  | "reports"
  | "system";

export type AuditStatus = "success" | "failure" | "blocked";

export type AuditInput = {
  user?: SessionUser | { id?: string | null; username?: string | null } | null;
  category: AuditCategory;
  action: string;
  description: string;
  status?: AuditStatus;
  ip?: string;
  userAgent?: string;
  meta?: Record<string, unknown>;
};

/** كتابة إدخال في سجل العمليات (لا يفشل الطلب الأصلي عند حدوث خطأ). */
export async function writeAuditLog(entry: AuditInput): Promise<void> {
  try {
    await ensureDbReady();
    await db.insert(auditLogs).values({
      userId: entry.user?.id ?? null,
      username: entry.user?.username ?? "system",
      category: entry.category,
      action: entry.action,
      description: entry.description,
      status: entry.status ?? "success",
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
      meta: entry.meta ?? null,
    });
  } catch (error) {
    console.error("[audit] فشل تسجيل العملية:", error);
  }
}

/** رموز العمليات الموحدة (تُستخدم في الفلاتر والتقارير). */
export const AUDIT_ACTIONS = {
  LOGIN_SUCCESS: "تسجيل دخول ناجح",
  LOGIN_FAILED: "محاولة دخول فاشلة",
  LOGIN_LOCKED: "قفل الحساب لكثرة المحاولات",
  LOGOUT: "تسجيل خروج",
  SESSION_REJECTED: "رفض جلسة غير صالحة",
  FILE_UPLOAD: "رفع ملف",
  FILE_SCAN_BLOCKED: "حجز ملف ضار",
  FILE_DOWNLOAD: "تنزيل ملف",
  FILE_DELETE: "حذف ملف",
  FILE_QUARANTINE: "عزل ملف",
  FILE_RELEASE: "إخراج ملف من العزل",
  ALERT_CREATE: "إنشاء تنبيه",
  ALERT_UPDATE: "تحديث تنبيه",
  ALERT_RESOLVE: "إغلاق تنبيه",
  ALERT_DELETE: "حذف تنبيه",
  USER_CREATE: "إنشاء مستخدم",
  USER_UPDATE: "تعديل مستخدم",
  USER_DELETE: "حذف مستخدم",
  USER_PASSWORD_RESET: "إعادة تعيين كلمة مرور",
  DEVICE_CREATE: "إضافة جهاز",
  DEVICE_UPDATE: "تعديل جهاز",
  DEVICE_QUARANTINE: "عزل جهاز",
  REPORT_GENERATE: "توليد تقرير",
  REPORT_EXPORT: "تصدير تقرير",
  AUDIT_EXPORT: "تصدير سجل العمليات",
  PERMISSION_DENIED: "محاولة وصول غير مصرح بها",
  RATE_LIMITED: "تجاوز حد الطلبات",
} as const;
