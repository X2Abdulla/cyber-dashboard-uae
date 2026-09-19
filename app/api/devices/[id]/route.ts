/**
 * /api/devices/[id] — تعديل/عزل/حذف جهاز.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { devices } from "@/db/schema";
import { fail, guard, handleUnknownError, ok, readJson } from "@/lib/api";
import { AUDIT_ACTIONS, writeAuditLog } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  status: z.enum(["online", "offline", "quarantined"]).optional(),
  patchesUpToDate: z.boolean().optional(),
  encryptionEnabled: z.boolean().optional(),
  location: z.string().max(120).optional(),
  ownerName: z.string().max(120).optional(),
  riskScore: z.number().int().min(0).max(100).optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  try {
    const result = await guard(request, {
      permission: PERMISSIONS.devicesManage,
      write: true,
      requireSameOrigin: true,
    });
    if (!result.authorized) return result.response;
    const { user, context } = result;

    const { id } = await params;
    const body = await readJson<z.infer<typeof patchSchema>>(request);
    if (body.error) return fail(body.error);
    const parsed = patchSchema.safeParse(body.data);
    if (!parsed.success) return fail("بيانات التعديل غير صالحة.");

    const rows = await db.select().from(devices).where(eq(devices.id, id)).limit(1);
    const device = rows[0];
    if (!device) return fail("الجهاز غير موجود.", 404);

    const updated = await db
      .update(devices)
      .set({
        status: parsed.data.status ?? device.status,
        patchesUpToDate: parsed.data.patchesUpToDate ?? device.patchesUpToDate,
        encryptionEnabled: parsed.data.encryptionEnabled ?? device.encryptionEnabled,
        location: parsed.data.location ?? device.location,
        ownerName: parsed.data.ownerName ?? device.ownerName,
        // إعادة حساب درجة الخطورة آلياً عند تغيير حالة الامتثال.
        riskScore:
          parsed.data.riskScore ??
          Math.max(
            0,
            Math.min(
              100,
              device.riskScore +
                (parsed.data.patchesUpToDate === true ? -12 : 0) +
                (parsed.data.encryptionEnabled === true ? -10 : 0) +
                (parsed.data.status === "quarantined" ? 20 : 0),
            ),
          ),
        lastSeenAt: new Date(),
      })
      .where(eq(devices.id, id))
      .returning();

    const quarantined = parsed.data.status === "quarantined" && device.status !== "quarantined";
    await writeAuditLog({
      user,
      category: "devices",
      action: quarantined ? AUDIT_ACTIONS.DEVICE_QUARANTINE : AUDIT_ACTIONS.DEVICE_UPDATE,
      description: `${quarantined ? "عزل" : "تحديث"} الجهاز ${device.name}${parsed.data.status ? ` → ${parsed.data.status}` : ""}`,
      status: "success",
      ip: context.ip,
      userAgent: context.userAgent,
      meta: { deviceId: id, patch: parsed.data },
    });

    const record = updated[0]!;
    return ok({ device: { ...record, lastSeenAt: record.lastSeenAt.toISOString(), createdAt: record.createdAt.toISOString() } });
  } catch (error) {
    return handleUnknownError(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const result = await guard(request, {
      permission: PERMISSIONS.devicesManage,
      write: true,
      requireSameOrigin: true,
    });
    if (!result.authorized) return result.response;
    const { user, context } = result;

    const { id } = await params;
    const rows = await db.select({ id: devices.id, name: devices.name }).from(devices).where(eq(devices.id, id)).limit(1);
    const device = rows[0];
    if (!device) return fail("الجهاز غير موجود.", 404);

    await db.delete(devices).where(eq(devices.id, id));
    await writeAuditLog({
      user,
      category: "devices",
      action: "DEVICE_DELETE",
      description: `حذف الجهاز ${device.name} من سجل الأصول`,
      status: "success",
      ip: context.ip,
      userAgent: context.userAgent,
      meta: { deviceId: id },
    });

    return ok({ deleted: true, id });
  } catch (error) {
    return handleUnknownError(error);
  }
}

/** إعادة ضبط درجة الخطورة لكل الأجهزة بناءً على الامتثال (إجراء جماعي). */
export async function POST(request: Request, { params }: Params) {
  try {
    const result = await guard(request, {
      permission: PERMISSIONS.devicesManage,
      write: true,
      requireSameOrigin: true,
    });
    if (!result.authorized) return result.response;
    const { user, context } = result;
    const { id } = await params;

    const rows = await db.select().from(devices).where(eq(devices.id, id)).limit(1);
    const device = rows[0];
    if (!device) return fail("الجهاز غير موجود.", 404);

    let score = device.status === "quarantined" ? 60 : 10;
    if (!device.patchesUpToDate) score += 20;
    if (!device.encryptionEnabled) score += 15;
    score += Math.round(device.cpuLoad / 10);
    score = Math.max(0, Math.min(100, score));

    await db.update(devices).set({ riskScore: score }).where(eq(devices.id, id));
    await writeAuditLog({
      user,
      category: "devices",
      action: "DEVICE_RISK_RECALC",
      description: `إعادة حساب درجة خطورة الجهاز ${device.name} → ${score}`,
      status: "success",
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return ok({ deviceId: id, riskScore: score });
  } catch (error) {
    return handleUnknownError(error);
  }
}
