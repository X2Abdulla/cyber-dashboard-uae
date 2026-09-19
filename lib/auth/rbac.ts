/**
 * ============================================================================
 *  التحكم بالصلاحيات (RBAC) — مدير / مشرف / مستخدم
 * ============================================================================
 *  مصفوفة صلاحيات مركزية: كل نقطة حماية في النظام تستدعي `can(role, permission)`
 *  مما يجعل إضافة دور جديد أو تعديل صلاحية تغييراً في مكان واحد فقط.
 */
import type { Role } from "@/lib/types";

/** قائمة الصلاحيات الدقيقة في المنصة. */
export const PERMISSIONS = {
  dashboardRead: "dashboard:read",
  alertsRead: "alerts:read",
  alertsManage: "alerts:manage",
  filesRead: "files:read",
  filesUpload: "files:upload",
  filesDownload: "files:download",
  filesDelete: "files:delete",
  filesQuarantine: "files:quarantine",
  devicesRead: "devices:read",
  devicesManage: "devices:manage",
  reportsRead: "reports:read",
  reportsGenerate: "reports:generate",
  reportsExport: "reports:export",
  usersRead: "users:read",
  usersManage: "users:manage",
  auditRead: "audit:read",
  auditExport: "audit:export",
  systemSettings: "system:settings",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** مصفوفة الصلاحيات لكل دور. */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  // المدير: صلاحيات كاملة.
  admin: Object.values(PERMISSIONS),
  // المشرف الأمني: إدارة التشغيل اليومي دون التحكم في الحسابات.
  supervisor: [
    PERMISSIONS.dashboardRead,
    PERMISSIONS.alertsRead,
    PERMISSIONS.alertsManage,
    PERMISSIONS.filesRead,
    PERMISSIONS.filesUpload,
    PERMISSIONS.filesDownload,
    PERMISSIONS.filesQuarantine,
    PERMISSIONS.devicesRead,
    PERMISSIONS.devicesManage,
    PERMISSIONS.reportsRead,
    PERMISSIONS.reportsGenerate,
    PERMISSIONS.reportsExport,
    PERMISSIONS.usersRead,
    PERMISSIONS.auditRead,
    PERMISSIONS.auditExport,
  ],
  // المستخدم: عرض + رفع ملفات خاصة به.
  user: [
    PERMISSIONS.dashboardRead,
    PERMISSIONS.alertsRead,
    PERMISSIONS.filesRead,
    PERMISSIONS.filesUpload,
    PERMISSIONS.filesDownload,
    PERMISSIONS.devicesRead,
    PERMISSIONS.reportsRead,
  ],
};

/** هل يملك الدور هذه الصلاحية؟ */
export function can(role: Role | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** أسماء عربية للأدوار (تُستخدم في الواجهة والتقارير). */
export const ROLE_LABELS: Record<Role, string> = {
  admin: "مدير النظام",
  supervisor: "مشرف أمني",
  user: "مستخدم",
};

/** وصف عربي موجز لمهام كل دور. */
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "تحكم كامل: الحسابات، الإعدادات، حذف البيانات، وتصدير كل التقارير.",
  supervisor: "إدارة التنبيهات والملفات والأجهزة وتوليد التقارير دون إدارة الحسابات.",
  user: "الاطلاع على اللوحات ورفع الملفات الخاصة به وتنزيل المسموح له.",
};
