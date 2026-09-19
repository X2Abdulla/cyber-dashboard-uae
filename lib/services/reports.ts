/**
 * ============================================================================
 *  خدمة التقارير الأمنية الدورية
 * ============================================================================
 *  تجميع المؤشرات من قاعدة البيانات لأي فترة (يومي/أسبوعي/شهري)،
 *  توليد ملخص تنفيذي عربي، ثم تخزين التقرير وإتاحته للتصدير.
 */
import { desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { alerts, auditLogs, devices, files, reports, users } from "@/db/schema";
import { ensureDbReady } from "@/db/bootstrap";
import { PERIOD_LABELS, THREAT_TYPE_LABELS } from "@/lib/format";
import type { ReportPeriod, SessionUser } from "@/lib/types";

export type ReportMetrics = {
  period: ReportPeriod;
  alerts: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    resolved: number;
    open: number;
    resolutionRate: number;
  };
  threatsByType: { type: string; label: string; count: number }[];
  files: {
    uploaded: number;
    clean: number;
    suspicious: number;
    malicious: number;
    quarantined: number;
    totalSizeBytes: number;
  };
  auth: { logins: number; failedLogins: number; blockedActions: number };
  devices: {
    total: number;
    online: number;
    offline: number;
    quarantined: number;
    averageRisk: number;
    nonCompliant: number;
  };
  users: { total: number; active: number; admins: number };
  operations: { total: number; success: number; failure: number; blocked: number };
  securityScore: number;
  topSourceIps: { ip: string; count: number }[];
};

/** نطاق الفترة الزمنية للتقرير. */
export function periodRange(period: ReportPeriod, end = new Date()): { start: Date; end: Date } {
  const start = new Date(end);
  if (period === "daily") start.setDate(start.getDate() - 1);
  else if (period === "weekly") start.setDate(start.getDate() - 7);
  else start.setDate(start.getDate() - 30);
  return { start, end };
}

/** حساب درجة الأمان من مؤشرات الفترة. */
export function computeSecurityScore(metrics: Omit<ReportMetrics, "securityScore">): number {
  const penalty =
    metrics.alerts.critical * 6 +
    metrics.alerts.high * 3 +
    metrics.alerts.medium * 1.2 +
    metrics.files.malicious * 4 +
    metrics.devices.quarantined * 3 +
    metrics.auth.failedLogins * 0.5 +
    metrics.devices.averageRisk * 0.2;
  return Math.max(15, Math.min(100, Math.round(100 - penalty)));
}

/** توليد الملخص التنفيذي العربي. */
export function buildSummary(metrics: ReportMetrics): string {
  const grade =
    metrics.securityScore >= 85 ? "ممتازة" : metrics.securityScore >= 70 ? "جيدة" : metrics.securityScore >= 50 ? "متوسطة وتحتاج انتباهاً" : "حرجة وتتطلب تدخلاً فورياً";
  const topThreat = metrics.threatsByType[0];
  return [
    `يغطي هذا التقرير الفترة ${PERIOD_LABELS[metrics.period]} من ${metrics.alerts.total} تنبيهاً أمنياً،`,
    `منها ${metrics.alerts.critical} حرجة و${metrics.alerts.high} عالية الخطورة، وقد تمت معالجة ${metrics.alerts.resolutionRate}% منها.`,
    topThreat ? `أكثر أنواع التهديدات تكراراً: ${topThreat.label} (${topThreat.count} حالة).` : "",
    `تم فحص ${metrics.files.uploaded} ملفاً، حُجز منها ${metrics.files.malicious + metrics.files.suspicious} ملفاً غير سليم.`,
    `سجّلت المنصة ${metrics.auth.failedLogins} محاولة دخول فاشلة و${metrics.auth.blockedActions} عملية محظورة.`,
    `حالة الأجهزة: ${metrics.devices.online} متصل من أصل ${metrics.devices.total}، و${metrics.devices.nonCompliant} جهازاً مخالفاً للسياسة.`,
    `الدرجة الأمنية الإجمالية: ${metrics.securityScore}/100 (${grade}).`,
  ]
    .filter(Boolean)
    .join(" ");
}

/** تجميع مؤشرات فترة معينة. */
export async function collectMetrics(period: ReportPeriod, end = new Date()): Promise<ReportMetrics> {
  await ensureDbReady();
  const { start } = periodRange(period, end);
  const from = start;
  const to = end;

  const [alertRows, typeRows, fileRows, authRows, deviceRows, userRows, ipRows] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        critical: sql<number>`count(*) filter (where severity = 'critical')::int`,
        high: sql<number>`count(*) filter (where severity = 'high')::int`,
        medium: sql<number>`count(*) filter (where severity = 'medium')::int`,
        low: sql<number>`count(*) filter (where severity = 'low')::int`,
        resolved: sql<number>`count(*) filter (where status in ('resolved','false_positive'))::int`,
        open: sql<number>`count(*) filter (where status in ('new','investigating'))::int`,
      })
      .from(alerts)
      .where(sql`detected_at between ${from} and ${to}`),
    db
      .select({ type: alerts.type, count: sql<number>`count(*)::int` })
      .from(alerts)
      .where(sql`detected_at between ${from} and ${to}`)
      .groupBy(alerts.type)
      .orderBy(desc(sql`count(*)`))
      .limit(6),
    db
      .select({
        uploaded: sql<number>`count(*)::int`,
        clean: sql<number>`count(*) filter (where verdict = 'clean')::int`,
        suspicious: sql<number>`count(*) filter (where verdict = 'suspicious')::int`,
        malicious: sql<number>`count(*) filter (where verdict = 'malicious')::int`,
        quarantined: sql<number>`count(*) filter (where quarantined)::int`,
        totalSizeBytes: sql<number>`coalesce(sum(size_bytes), 0)::bigint`,
      })
      .from(files)
      .where(sql`created_at between ${from} and ${to}`),
    db
      .select({
        logins: sql<number>`count(*) filter (where action = 'LOGIN_SUCCESS')::int`,
        failedLogins: sql<number>`count(*) filter (where action = 'LOGIN_FAILED')::int`,
        blockedActions: sql<number>`count(*) filter (where status = 'blocked')::int`,
        total: sql<number>`count(*)::int`,
        success: sql<number>`count(*) filter (where status = 'success')::int`,
        failure: sql<number>`count(*) filter (where status = 'failure')::int`,
      })
      .from(auditLogs)
      .where(sql`created_at between ${from} and ${to}`),
    db
      .select({
        total: sql<number>`count(*)::int`,
        online: sql<number>`count(*) filter (where status = 'online')::int`,
        offline: sql<number>`count(*) filter (where status = 'offline')::int`,
        quarantined: sql<number>`count(*) filter (where status = 'quarantined')::int`,
        averageRisk: sql<number>`coalesce(round(avg(risk_score)), 0)::int`,
        nonCompliant: sql<number>`count(*) filter (where not patches_up_to_date or not encryption_enabled)::int`,
      })
      .from(devices),
    db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where status = 'active')::int`,
        admins: sql<number>`count(*) filter (where role = 'admin')::int`,
      })
      .from(users),
    db
      .select({ ip: sql<string>`coalesce(source_ip, 'غير معروف')`, count: sql<number>`count(*)::int` })
      .from(alerts)
      .where(sql`detected_at between ${from} and ${to}`)
      .groupBy(sql`coalesce(source_ip, 'غير معروف')`)
      .orderBy(desc(sql`count(*)`))
      .limit(5),
  ]);

  const a = alertRows[0] ?? { total: 0, critical: 0, high: 0, medium: 0, low: 0, resolved: 0, open: 0 };
  const f = fileRows[0] ?? { uploaded: 0, clean: 0, suspicious: 0, malicious: 0, quarantined: 0, totalSizeBytes: 0 };
  const auth = authRows[0] ?? { logins: 0, failedLogins: 0, blockedActions: 0, total: 0, success: 0, failure: 0 };
  const d = deviceRows[0] ?? { total: 0, online: 0, offline: 0, quarantined: 0, averageRisk: 0, nonCompliant: 0 };
  const u = userRows[0] ?? { total: 0, active: 0, admins: 0 };

  const base: Omit<ReportMetrics, "securityScore"> = {
    period,
    alerts: {
      ...a,
      resolutionRate: a.total === 0 ? 0 : Math.round((a.resolved / a.total) * 100),
    },
    threatsByType: typeRows.map((row) => ({
      type: row.type,
      label: THREAT_TYPE_LABELS[row.type] ?? row.type,
      count: row.count,
    })),
    files: { ...f, totalSizeBytes: Number(f.totalSizeBytes) },
    auth: { logins: auth.logins, failedLogins: auth.failedLogins, blockedActions: auth.blockedActions },
    devices: d,
    users: u,
    operations: { total: auth.total, success: auth.success, failure: auth.failure, blocked: auth.blockedActions },
    topSourceIps: ipRows.map((row) => ({ ip: row.ip, count: row.count })),
  };

  return { ...base, securityScore: computeSecurityScore(base) };
}

/** توليد تقرير وحفظه في قاعدة البيانات. */
export async function generateReport(period: ReportPeriod, actor: SessionUser) {
  await ensureDbReady();
  const { start, end } = periodRange(period);
  const metrics = await collectMetrics(period, end);
  const title = `التقرير الأمني ${PERIOD_LABELS[period]} — ${end.toLocaleDateString("ar-EG", { dateStyle: "long", numberingSystem: "latn" })}`;

  const inserted = await db
    .insert(reports)
    .values({
      title,
      period,
      periodStart: start,
      periodEnd: end,
      summary: buildSummary(metrics),
      metrics: metrics as unknown as Record<string, unknown>,
      generatedById: actor.id,
      generatedByName: actor.fullName,
    })
    .returning();

  return inserted[0]!;
}

/** قائمة التقارير الأحدث. */
export async function listReports(limit = 30) {
  await ensureDbReady();
  const rows = await db.select().from(reports).orderBy(desc(reports.createdAt)).limit(limit);
  return rows;
}

/** تفاصيل تقرير واحد. */
export async function getReportById(id: string) {
  await ensureDbReady();
  const rows = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
  return rows[0] ?? null;
}

/* -------------------------------------------------------------------------- */
/*                                   التصدير                                   */
/* -------------------------------------------------------------------------- */

/** تحويل مصفوفة كائنات إلى CSV مع دعم العربية (BOM). */
export function toCsv(rows: Record<string, string | number | null>[], headers: string[]): string {
  const escape = (value: string | number | null) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [headers.map(escape).join(",")];
  for (const row of rows) lines.push(headers.map((key) => escape(row[key] ?? null)).join(","));
  return `\uFEFF${lines.join("\n")}`;
}

/** بناء صفوف CSV من مؤشرات التقرير (شكل مسطّح يسهل فتحه في Excel). */
export function reportToRows(metrics: ReportMetrics): Record<string, string | number>[] {
  const rows: Record<string, string | number>[] = [
    { "المؤشر": "الفترة", "التصنيف": "عام", "القيمة": PERIOD_LABELS[metrics.period] },
    { "المؤشر": "إجمالي التنبيهات", "التصنيف": "التنبيهات", "القيمة": metrics.alerts.total },
    { "المؤشر": "تنبيهات حرجة", "التصنيف": "التنبيهات", "القيمة": metrics.alerts.critical },
    { "المؤشر": "تنبيهات عالية", "التصنيف": "التنبيهات", "القيمة": metrics.alerts.high },
    { "المؤشر": "تنبيهات متوسطة", "التصنيف": "التنبيهات", "القيمة": metrics.alerts.medium },
    { "المؤشر": "تنبيهات منخفضة", "التصنيف": "التنبيهات", "القيمة": metrics.alerts.low },
    { "المؤشر": "نسبة المعالجة %", "التصنيف": "التنبيهات", "القيمة": metrics.alerts.resolutionRate },
    { "المؤشر": "ملفات مرفوعة", "التصنيف": "الملفات", "القيمة": metrics.files.uploaded },
    { "المؤشر": "ملفات سليمة", "التصنيف": "الملفات", "القيمة": metrics.files.clean },
    { "المؤشر": "ملفات مشبوهة", "التصنيف": "الملفات", "القيمة": metrics.files.suspicious },
    { "المؤشر": "ملفات ضارة", "التصنيف": "الملفات", "القيمة": metrics.files.malicious },
    { "المؤشر": "حجم الملفات (بايت)", "التصنيف": "الملفات", "القيمة": metrics.files.totalSizeBytes },
    { "المؤشر": "عمليات دخول ناجحة", "التصنيف": "المصادقة", "القيمة": metrics.auth.logins },
    { "المؤشر": "محاولات دخول فاشلة", "التصنيف": "المصادقة", "القيمة": metrics.auth.failedLogins },
    { "المؤشر": "عمليات محظورة", "التصنيف": "المصادقة", "القيمة": metrics.auth.blockedActions },
    { "المؤشر": "إجمالي الأجهزة", "التصنيف": "الأصول", "القيمة": metrics.devices.total },
    { "المؤشر": "أجهزة متصلة", "التصنيف": "الأصول", "القيمة": metrics.devices.online },
    { "المؤشر": "أجهزة معزولة", "التصنيف": "الأصول", "القيمة": metrics.devices.quarantined },
    { "المؤشر": "أجهزة مخالفة للسياسة", "التصنيف": "الأصول", "القيمة": metrics.devices.nonCompliant },
    { "المؤشر": "متوسط خطورة الأصول", "التصنيف": "الأصول", "القيمة": metrics.devices.averageRisk },
    { "المؤشر": "المستخدمون النشطون", "التصنيف": "الحسابات", "القيمة": metrics.users.active },
    { "المؤشر": "الدرجة الأمنية", "التصنيف": "عام", "القيمة": metrics.securityScore },
  ];
  for (const threat of metrics.threatsByType) {
    rows.push({ "المؤشر": `تهديد: ${threat.label}`, "التصنيف": "التهديدات", "القيمة": threat.count });
  }
  for (const ip of metrics.topSourceIps) {
    rows.push({ "المؤشر": `مصدر الهجوم: ${ip.ip}`, "التصنيف": "المصادر", "القيمة": ip.count });
  }
  return rows;
}

/** تصدير سجل العمليات إلى CSV. */
export async function exportAuditCsv(filterStatus?: string, limit = 2000): Promise<string> {
  await ensureDbReady();
  const rows = await db
    .select({
      createdAt: auditLogs.createdAt,
      username: auditLogs.username,
      category: auditLogs.category,
      action: auditLogs.action,
      description: auditLogs.description,
      status: auditLogs.status,
      ip: auditLogs.ip,
    })
    .from(auditLogs)
    .where(filterStatus ? eq(auditLogs.status, filterStatus as never) : gte(auditLogs.createdAt, new Date(0)))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);

  return toCsv(
    rows.map((row) => ({
      "التوقيت": row.createdAt.toISOString(),
      "المستخدم": row.username ?? "",
      "التصنيف": row.category,
      "العملية": row.action,
      "الوصف": row.description,
      "النتيجة": row.status,
      "عنوان IP": row.ip ?? "",
    })),
    ["التوقيت", "المستخدم", "التصنيف", "العملية", "الوصف", "النتيجة", "عنوان IP"],
  );
}

/** تصدير قائمة التنبيهات إلى CSV. */
export async function exportAlertsCsv(severity?: string): Promise<string> {
  await ensureDbReady();
  const rows = await db
    .select()
    .from(alerts)
    .where(severity ? eq(alerts.severity, severity as never) : lte(alerts.detectedAt, new Date()))
    .orderBy(desc(alerts.detectedAt))
    .limit(2000);

  return toCsv(
    rows.map((row) => ({
      "التوقيت": row.detectedAt.toISOString(),
      "النوع": THREAT_TYPE_LABELS[row.type] ?? row.type,
      "العنوان": row.title,
      "الخطورة": row.severity,
      "الحالة": row.status,
      "مصدر IP": row.sourceIp ?? "",
      "الهدف": row.target ?? "",
      "درجة الخطورة": row.riskScore,
    })),
    ["التوقيت", "النوع", "العنوان", "الخطورة", "الحالة", "مصدر IP", "الهدف", "درجة الخطورة"],
  );
}
