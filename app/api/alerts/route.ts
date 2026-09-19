/**
 * ============================================================================
 *  /api/alerts — التنبيهات الأمنية: قائمة + فلاتر + إنشاء يدوي
 * ============================================================================
 */
import { desc, eq, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { alerts } from "@/db/schema";
import { fail, guard, handleUnknownError, ok, readJson } from "@/lib/api";
import { AUDIT_ACTIONS, writeAuditLog } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { sanitizeText } from "@/lib/security/request";

export const dynamic = "force-dynamic";

/** GET /api/alerts?status=&severity=&q=&limit= */
export async function GET(request: Request) {
  try {
    const result = await guard(request, { permission: PERMISSIONS.alertsRead });
    if (!result.authorized) return result.response;

    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? "";
    const severity = url.searchParams.get("severity") ?? "";
    const search = sanitizeText(url.searchParams.get("q") ?? "", 60);
    const limit = Math.min(300, Math.max(10, Number(url.searchParams.get("limit") ?? 60)));

    const conditions = [];
    if (["new", "investigating", "resolved", "false_positive"].includes(status)) {
      conditions.push(eq(alerts.status, status as "new" | "investigating" | "resolved" | "false_positive"));
    }
    if (["low", "medium", "high", "critical"].includes(severity)) {
      conditions.push(eq(alerts.severity, severity as "low" | "medium" | "high" | "critical"));
    }
    if (search) {
      conditions.push(
        or(like(alerts.title, `%${search}%`), like(alerts.description, `%${search}%`), like(alerts.sourceIp, `%${search}%`))!,
      );
    }

    const rows = await db
      .select()
      .from(alerts)
      .where(conditions.length > 0 ? sql`(${sql.join(conditions, sql` AND `)})` : sql`1=1`)
      .orderBy(desc(alerts.detectedAt))
      .limit(limit);

    const counts = await db
      .select({
        total: sql<number>`count(*)::int`,
        open: sql<number>`count(*) filter (where status in ('new','investigating'))::int`,
        critical: sql<number>`count(*) filter (where severity = 'critical' and status in ('new','investigating'))::int`,
        resolved: sql<number>`count(*) filter (where status in ('resolved','false_positive'))::int`,
      })
      .from(alerts);

    return ok({
      alerts: rows.map((row) => ({
        ...row,
        detectedAt: row.detectedAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
        resolvedAt: row.resolvedAt?.toISOString() ?? null,
      })),
      stats: counts[0] ?? { total: 0, open: 0, critical: 0, resolved: 0 },
    });
  } catch (error) {
    return handleUnknownError(error);
  }
}

const createSchema = z.object({
  title: z.string().min(3).max(180),
  description: z.string().min(3).max(1200),
  severity: z.enum(["low", "medium", "high", "critical"]),
  type: z.string().min(2).max(48),
  sourceIp: z.string().max(64).optional(),
  target: z.string().max(120).optional(),
  deviceName: z.string().max(120).optional(),
});

/** POST /api/alerts — تسجيل تنبيه يدوي (مشرف/مدير). */
export async function POST(request: Request) {
  try {
    const result = await guard(request, {
      permission: PERMISSIONS.alertsManage,
      write: true,
      requireSameOrigin: true,
    });
    if (!result.authorized) return result.response;
    const { user, context } = result;

    const body = await readJson<z.infer<typeof createSchema>>(request);
    if (body.error) return fail(body.error);
    const parsed = createSchema.safeParse(body.data);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "بيانات التنبيه غير صالحة.");

    const risk = { low: 25, medium: 50, high: 75, critical: 95 }[parsed.data.severity];

    const inserted = await db
      .insert(alerts)
      .values({
        type: sanitizeText(parsed.data.type, 48),
        title: sanitizeText(parsed.data.title, 180),
        description: sanitizeText(parsed.data.description, 1200),
        severity: parsed.data.severity,
        status: "new",
        sourceIp: parsed.data.sourceIp ? sanitizeText(parsed.data.sourceIp, 64) : context.ip,
        target: parsed.data.target ? sanitizeText(parsed.data.target, 120) : null,
        deviceName: parsed.data.deviceName ? sanitizeText(parsed.data.deviceName, 120) : null,
        riskScore: risk,
        detectedAt: new Date(),
      })
      .returning();

    await writeAuditLog({
      user,
      category: "alerts",
      action: AUDIT_ACTIONS.ALERT_CREATE,
      description: `إنشاء تنبيه يدوي: ${parsed.data.title}`,
      status: "success",
      ip: context.ip,
      userAgent: context.userAgent,
      meta: { alertId: inserted[0]!.id },
    });

    return ok({ alert: { ...inserted[0]!, detectedAt: inserted[0]!.detectedAt.toISOString(), createdAt: inserted[0]!.createdAt.toISOString() } }, { status: 201 });
  } catch (error) {
    return handleUnknownError(error);
  }
}
