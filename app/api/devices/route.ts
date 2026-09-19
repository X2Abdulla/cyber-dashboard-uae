/**
 * /api/devices — إدارة الأصول والأجهزة الذكية (قائمة + إضافة).
 */
import { desc, eq, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { devices } from "@/db/schema";
import { fail, guard, handleUnknownError, ok, readJson } from "@/lib/api";
import { AUDIT_ACTIONS, writeAuditLog } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { sanitizeText } from "@/lib/security/request";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const result = await guard(request, { permission: PERMISSIONS.devicesRead });
    if (!result.authorized) return result.response;

    const url = new URL(request.url);
    const search = sanitizeText(url.searchParams.get("q") ?? "", 60);
    const status = url.searchParams.get("status") ?? "";
    const type = url.searchParams.get("type") ?? "";

    const conditions = [];
    if (["online", "offline", "quarantined"].includes(status)) {
      conditions.push(eq(devices.status, status as "online" | "offline" | "quarantined"));
    }
    if (type) conditions.push(eq(devices.type, type));
    if (search) {
      conditions.push(
        or(like(devices.name, `%${search}%`), like(devices.ipAddress, `%${search}%`), like(devices.location, `%${search}%`))!,
      );
    }

    const rows = await db
      .select()
      .from(devices)
      .where(conditions.length > 0 ? sql`(${sql.join(conditions, sql` AND `)})` : sql`1=1`)
      .orderBy(desc(devices.riskScore))
      .limit(200);

    const stats = await db
      .select({
        total: sql<number>`count(*)::int`,
        online: sql<number>`count(*) filter (where status='online')::int`,
        offline: sql<number>`count(*) filter (where status='offline')::int`,
        quarantined: sql<number>`count(*) filter (where status='quarantined')::int`,
        averageRisk: sql<number>`coalesce(round(avg(risk_score)),0)::int`,
        nonCompliant: sql<number>`count(*) filter (where not patches_up_to_date or not encryption_enabled)::int`,
      })
      .from(devices);

    return ok({
      devices: rows.map((row) => ({
        ...row,
        lastSeenAt: row.lastSeenAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
      })),
      stats: stats[0] ?? { total: 0, online: 0, offline: 0, quarantined: 0, averageRisk: 0, nonCompliant: 0 },
    });
  } catch (error) {
    return handleUnknownError(error);
  }
}

const createSchema = z.object({
  name: z.string().min(2).max(120),
  type: z.enum(["server", "workstation", "router", "camera", "iot", "mobile"]),
  ipAddress: z.string().min(7).max(64),
  macAddress: z.string().max(32).optional(),
  os: z.string().max(80).optional(),
  location: z.string().max(120).optional(),
  ownerName: z.string().max(120).optional(),
});

export async function POST(request: Request) {
  try {
    const result = await guard(request, {
      permission: PERMISSIONS.devicesManage,
      write: true,
      requireSameOrigin: true,
    });
    if (!result.authorized) return result.response;
    const { user, context } = result;

    const body = await readJson<z.infer<typeof createSchema>>(request);
    if (body.error) return fail(body.error);
    const parsed = createSchema.safeParse(body.data);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "بيانات الجهاز غير صالحة.");

    // منع تكرار عنوان IP داخل الشبكة.
    const duplicate = await db.select({ id: devices.id }).from(devices).where(eq(devices.ipAddress, parsed.data.ipAddress)).limit(1);
    if (duplicate.length > 0) return fail("يوجد جهاز مسجل بنفس عنوان IP.", 409);

    const inserted = await db
      .insert(devices)
      .values({
        name: sanitizeText(parsed.data.name, 120),
        type: parsed.data.type,
        ipAddress: sanitizeText(parsed.data.ipAddress, 64),
        macAddress: parsed.data.macAddress ? sanitizeText(parsed.data.macAddress, 32) : null,
        os: parsed.data.os ? sanitizeText(parsed.data.os, 80) : null,
        location: parsed.data.location ? sanitizeText(parsed.data.location, 120) : null,
        ownerName: parsed.data.ownerName ? sanitizeText(parsed.data.ownerName, 120) : user.fullName,
        ownerId: user.id,
        status: "online",
        riskScore: 10,
        lastSeenAt: new Date(),
      })
      .returning();

    await writeAuditLog({
      user,
      category: "devices",
      action: AUDIT_ACTIONS.DEVICE_CREATE,
      description: `إضافة جهاز جديد: ${parsed.data.name} (${parsed.data.ipAddress})`,
      status: "success",
      ip: context.ip,
      userAgent: context.userAgent,
      meta: { deviceId: inserted[0]!.id },
    });

    const created = inserted[0]!;
    return ok({ device: { ...created, lastSeenAt: created.lastSeenAt.toISOString(), createdAt: created.createdAt.toISOString() } }, { status: 201 });
  } catch (error) {
    return handleUnknownError(error);
  }
}
