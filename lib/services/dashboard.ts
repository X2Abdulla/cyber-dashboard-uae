/**
 * ============================================================================
 *  خدمة لوحة التحكم — تجميع كل مؤشرات الأمن والإدارة الذكية
 * ============================================================================
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { alerts, auditLogs, devices, files, users } from "@/db/schema";
import { ensureDbReady } from "@/db/bootstrap";
import type { MetricPoint } from "@/lib/types";

export type SeverityBucket = { severity: string; count: number };
export type ThreatTypeBucket = { type: string; count: number };
export type TrendPoint = { day: string; count: number };

export type DashboardData = {
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
  series: {
    traffic: MetricPoint[];
    threats: MetricPoint[];
    blocked: MetricPoint[];
    scans: MetricPoint[];
  };
  severityDistribution: SeverityBucket[];
  threatTypes: ThreatTypeBucket[];
  weeklyTrend: TrendPoint[];
  deviceRisk: { name: string; type: string; riskScore: number; status: string }[];
  recentAlerts: {
    id: string;
    title: string;
    type: string;
    severity: string;
    status: string;
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
  generatedAt: string;
};

const toIso = (value: unknown): string =>
  value instanceof Date ? value.toISOString() : String(value ?? new Date().toISOString());

/** بناء بيانات لوحة التحكم بالكامل في استعلامات مجمّعة. */
export async function getDashboardData(): Promise<DashboardData> {
  await ensureDbReady();

  const day24 = sql`now() - interval '24 hours'`;
  const day7 = sql`now() - interval '7 days'`;

  const [alertRows, fileRows, deviceRows, userRows, auditRows] = await Promise.all([
    db
      .select({
        open: sql<number>`count(*) filter (where status in ('new','investigating'))::int`,
        criticalOpen: sql<number>`count(*) filter (where status in ('new','investigating') and severity in ('high','critical'))::int`,
        last24: sql<number>`count(*) filter (where detected_at > ${day24})::int`,
        week: sql<number>`count(*) filter (where detected_at > ${day7})::int`,
      })
      .from(alerts),
    db
      .select({
        total: sql<number>`count(*)::int`,
        scanned24: sql<number>`count(*) filter (where created_at > ${day24})::int`,
        malicious: sql<number>`count(*) filter (where verdict <> 'clean')::int`,
        quarantined: sql<number>`count(*) filter (where quarantined)::int`,
      })
      .from(files),
    db
      .select({
        total: sql<number>`count(*)::int`,
        online: sql<number>`count(*) filter (where status = 'online')::int`,
        quarantined: sql<number>`count(*) filter (where status = 'quarantined')::int`,
        avgRisk: sql<number>`coalesce(round(avg(risk_score)), 0)::int`,
      })
      .from(devices),
    db.select({ total: sql<number>`count(*) filter (where status = 'active')::int` }).from(users),
    db
      .select({
        failed24: sql<number>`count(*) filter (where created_at > ${day24} and status <> 'success')::int`,
        blocked24: sql<number>`count(*) filter (where created_at > ${day24} and status = 'blocked')::int`,
      })
      .from(auditLogs),
  ]);

  const alertStats = alertRows[0] ?? { open: 0, criticalOpen: 0, last24: 0, week: 0 };
  const fileStats = fileRows[0] ?? { total: 0, scanned24: 0, malicious: 0, quarantined: 0 };
  const deviceStats = deviceRows[0] ?? { total: 0, online: 0, quarantined: 0, avgRisk: 0 };
  const userStats = userRows[0] ?? { total: 0 };
  const auditStats = auditRows[0] ?? { failed24: 0, blocked24: 0 };

  // درجة الأمان الشاملة (0-100) محسوبة من التنبيهات المفتوحة والملفات الضارة والأجهزة.
  const penalty =
    alertStats.criticalOpen * 6 +
    alertStats.open * 1.5 +
    fileStats.malicious * 2 +
    deviceStats.quarantined * 3 +
    deviceStats.avgRisk * 0.25 +
    auditStats.failed24 * 0.4;
  const securityScore = Math.max(18, Math.min(100, Math.round(100 - penalty)));

  /* --- السلاسل الزمنية الحية (آخر 60 دقيقة) --- */
  const seriesRows = await db
    .select({
      series: sql<string>`series`,
      time: sql<string>`to_char(recorded_at, 'HH24:MI')`,
      value: sql<number>`value::int`,
    })
    .from(sql`(SELECT series, value, recorded_at FROM metric_points WHERE recorded_at > now() - interval '70 minutes' ORDER BY recorded_at ASC) AS live`)
    .orderBy(sql`recorded_at ASC`);

  const series = { traffic: [] as MetricPoint[], threats: [] as MetricPoint[], blocked: [] as MetricPoint[], scans: [] as MetricPoint[] };
  for (const row of seriesRows) {
    const key = row.series as keyof typeof series;
    if (key in series) series[key].push({ time: row.time, value: row.value });
  }
  // الإبقاء على آخر 60 نقطة لكل سلسلة حتى تبقى الرسوم خفيفة.
  for (const key of Object.keys(series) as (keyof typeof series)[]) {
    series[key] = series[key].slice(-60);
  }

  /* --- توزيع الخطورة للتنبيهات المفتوحة --- */
  const severityRows = await db
    .select({ severity: alerts.severity, count: sql<number>`count(*)::int` })
    .from(alerts)
    .where(sql`status in ('new','investigating')`)
    .groupBy(alerts.severity);

  /* --- أكثر أنواع التهديدات خلال أسبوع --- */
  const threatRows = await db
    .select({ type: alerts.type, count: sql<number>`count(*)::int` })
    .from(alerts)
    .where(gte(alerts.detectedAt, sql`now() - interval '7 days'`))
    .groupBy(alerts.type)
    .orderBy(desc(sql`count(*)`))
    .limit(6);

  /* --- اتجاه التنبيهات خلال 7 أيام --- */
  const trendRows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', detected_at), 'MM-DD')`,
      count: sql<number>`count(*)::int`,
    })
    .from(alerts)
    .where(gte(alerts.detectedAt, sql`now() - interval '7 days'`))
    .groupBy(sql`date_trunc('day', detected_at)`)
    .orderBy(sql`date_trunc('day', detected_at)`);

  /* --- أعلى الأجهزة خطورة --- */
  const riskRows = await db
    .select({ name: devices.name, type: devices.type, riskScore: devices.riskScore, status: devices.status })
    .from(devices)
    .orderBy(desc(devices.riskScore))
    .limit(5);

  /* --- أحدث التنبيهات والنشاطات --- */
  const recentAlertRows = await db
    .select({
      id: alerts.id,
      title: alerts.title,
      type: alerts.type,
      severity: alerts.severity,
      status: alerts.status,
      sourceIp: alerts.sourceIp,
      detectedAt: alerts.detectedAt,
    })
    .from(alerts)
    .orderBy(desc(alerts.detectedAt))
    .limit(7);

  const recentActivityRows = await db
    .select({
      id: auditLogs.id,
      username: auditLogs.username,
      category: auditLogs.category,
      action: auditLogs.action,
      description: auditLogs.description,
      status: auditLogs.status,
      ip: auditLogs.ip,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(8);

  return {
    kpis: {
      openAlerts: alertStats.open,
      criticalOpen: alertStats.criticalOpen,
      threats24h: alertStats.last24,
      blocked24h: auditStats.blocked24,
      filesScanned: fileStats.scanned24,
      maliciousFiles: fileStats.malicious,
      devicesTotal: deviceStats.total,
      devicesOnline: deviceStats.online,
      devicesQuarantined: deviceStats.quarantined,
      activeUsers: userStats.total,
      failedLogins24h: auditStats.failed24,
      securityScore,
      averageRisk: deviceStats.avgRisk,
    },
    series,
    severityDistribution: severityRows.map((row) => ({ severity: row.severity, count: row.count })),
    threatTypes: threatRows.map((row) => ({ type: row.type, count: row.count })),
    weeklyTrend: trendRows.map((row) => ({ day: row.day, count: row.count })),
    deviceRisk: riskRows.map((row) => ({
      name: row.name,
      type: row.type,
      riskScore: row.riskScore,
      status: row.status,
    })),
    recentAlerts: recentAlertRows.map((row) => ({ ...row, detectedAt: toIso(row.detectedAt) })),
    recentActivity: recentActivityRows.map((row) => ({ ...row, createdAt: toIso(row.createdAt) })),
    generatedAt: new Date().toISOString(),
  };
}

/** أحدث التنبيهات غير المقروءة (للجرس في الشريط العلوي). */
export async function getNotificationFeed(limit = 6) {
  await ensureDbReady();
  const rows = await db
    .select({
      id: alerts.id,
      title: alerts.title,
      severity: alerts.severity,
      type: alerts.type,
      detectedAt: alerts.detectedAt,
    })
    .from(alerts)
    .where(eq(alerts.status, "new"))
    .orderBy(desc(alerts.detectedAt))
    .limit(limit);
  return rows.map((row) => ({ ...row, detectedAt: toIso(row.detectedAt) }));
}

/** عدد التنبيهات الجديدة (للعدّاد الحي). */
export async function countNewAlerts(): Promise<number> {
  await ensureDbReady();
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(alerts)
    .where(eq(alerts.status, "new"));
  return rows[0]?.count ?? 0;
}
