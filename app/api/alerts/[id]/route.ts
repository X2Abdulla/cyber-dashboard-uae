/**
 * /api/alerts/[id] — تحديث حالة التنبيه (تحقيق/معالجة/إنذار كاذب) أو حذفه.
 */
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { alerts, devices } from "@/db/schema";
import { fail, guard, handleUnknownError, ok, readJson } from "@/lib/api";
import { AUDIT_ACTIONS, writeAuditLog } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { sanitizeText } from "@/lib/security/request";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  status: z.enum(["new", "investigating", "resolved", "false_positive"]).optional(),
  resolutionNote: z.string().max(800).optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  isolateDevice: z.boolean().optional(),
});

/** PATCH — معالجة التنبيه، مع خيار عزل الجهاز المرتبط تلقائياً. */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const result = await guard(request, {
      permission: PERMISSIONS.alertsManage,
      write: true,
      requireSameOrigin: true,
    });
    if (!result.authorized) return result.response;
    const { user, context } = result;

    const { id } = await params;
    const rows = await db.select().from(alerts).where(eq(alerts.id, id)).limit(1);
    const alert = rows[0];
    if (!alert) return fail("التنبيه غير موجود.", 404);

    const body = await readJson<z.infer<typeof patchSchema>>(request);
    if (body.error) return fail(body.error);
    const parsed = patchSchema.safeParse(body.data);
    if (!parsed.success) return fail("بيانات التحديث غير صالحة.");

    const nextStatus = parsed.data.status ?? alert.status;
    const closed = nextStatus === "resolved" || nextStatus === "false_positive";

    const updated = await db
      .update(alerts)
      .set({
        status: nextStatus,
        severity: parsed.data.severity ?? alert.severity,
        resolutionNote: parsed.data.resolutionNote ? sanitizeText(parsed.data.resolutionNote, 800) : alert.resolutionNote,
        resolvedAt: closed ? new Date() : null,
        resolvedById: closed ? user.id : null,
        resolvedByName: closed ? user.fullName : null,
      })
      .where(eq(alerts.id, id))
      .returning();

    // استجابة ذكية: عزل الجهاز المرتبط بالتنبيه عند الطلب.
    if (parsed.data.isolateDevice && alert.deviceName) {
      await db
        .update(devices)
        .set({ status: "quarantined", riskScore: sql`least(100, ${devices.riskScore} + 15)` })
        .where(eq(devices.name, alert.deviceName));

      await writeAuditLog({
        user,
        category: "devices",
        action: AUDIT_ACTIONS.DEVICE_QUARANTINE,
        description: `عزل الجهاز ${alert.deviceName} استجابةً للتنبيه ${alert.title}`,
        status: "success",
        ip: context.ip,
        userAgent: context.userAgent,
        meta: { alertId: id },
      });
    }

    await writeAuditLog({
      user,
      category: "alerts",
      action: closed ? AUDIT_ACTIONS.ALERT_RESOLVE : AUDIT_ACTIONS.ALERT_UPDATE,
      description: `${closed ? "إغلاق" : "تحديث"} التنبيه «${alert.title}» إلى حالة ${nextStatus}`,
      status: "success",
      ip: context.ip,
      userAgent: context.userAgent,
      meta: { alertId: id, note: parsed.data.resolutionNote },
    });

    return ok({
      alert: {
        ...updated[0]!,
        detectedAt: updated[0]!.detectedAt.toISOString(),
        createdAt: updated[0]!.createdAt.toISOString(),
        resolvedAt: updated[0]!.resolvedAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    return handleUnknownError(error);
  }
}

/** DELETE — حذف التنبيه نهائياً (مدير فقط عبر صلاحية alerts:manage + سجل تدقيق). */
export async function DELETE(request: Request, { params }: Params) {
  try {
    const result = await guard(request, {
      permission: PERMISSIONS.alertsManage,
      write: true,
      requireSameOrigin: true,
    });
    if (!result.authorized) return result.response;
    const { user, context } = result;

    const { id } = await params;
    const rows = await db.select({ id: alerts.id, title: alerts.title }).from(alerts).where(eq(alerts.id, id)).limit(1);
    const alert = rows[0];
    if (!alert) return fail("التنبيه غير موجود.", 404);

    await db.delete(alerts).where(eq(alerts.id, id));
    await writeAuditLog({
      user,
      category: "alerts",
      action: AUDIT_ACTIONS.ALERT_DELETE,
      description: `حذف التنبيه «${alert.title}»`,
      status: "success",
      ip: context.ip,
      userAgent: context.userAgent,
      meta: { alertId: id },
    });

    return ok({ deleted: true, id });
  } catch (error) {
    return handleUnknownError(error);
  }
}

/** GET — تفاصيل تنبيه واحد + سجل الأحداث المرتبطة به. */
export async function GET(request: Request, { params }: Params) {
  try {
    const result = await guard(request, { permission: PERMISSIONS.alertsRead });
    if (!result.authorized) return result.response;

    const { id } = await params;
    const rows = await db.select().from(alerts).where(eq(alerts.id, id)).limit(1);
    const alert = rows[0];
    if (!alert) return fail("التنبيه غير موجود.", 404);

    const related = await db
      .select({
        id: alerts.id,
        title: alerts.title,
        severity: alerts.severity,
        detectedAt: alerts.detectedAt,
      })
      .from(alerts)
      .where(sql`${alerts.sourceIp} = ${alert.sourceIp} AND ${alerts.id} <> ${alert.id}`)
      .orderBy(desc(alerts.detectedAt))
      .limit(5);

    return ok({
      alert: {
        ...alert,
        detectedAt: alert.detectedAt.toISOString(),
        createdAt: alert.createdAt.toISOString(),
        resolvedAt: alert.resolvedAt?.toISOString() ?? null,
      },
      related: related.map((row) => ({ ...row, detectedAt: row.detectedAt.toISOString() })),
    });
  } catch (error) {
    return handleUnknownError(error);
  }
}
