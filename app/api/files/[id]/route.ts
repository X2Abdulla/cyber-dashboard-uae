/**
 * ============================================================================
 *  /api/files/[id] — تنزيل / تعديل تصنيف / عزل / حذف ملف
 * ============================================================================
 *  التنزيل يتم دائماً كـ attachment مع ترويسات أمان لمنع تنفيذ المحتوى،
 *  والملفات المعزولة لا تُنزَّل إلا لمن يملك صلاحية إدارة العزل.
 */
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { files } from "@/db/schema";
import { fail, guard, handleUnknownError, ok, readJson } from "@/lib/api";
import { AUDIT_ACTIONS, writeAuditLog } from "@/lib/audit";
import { PERMISSIONS, can } from "@/lib/auth/rbac";
import { SECURITY_HEADERS } from "@/lib/security/request";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET — تنزيل محتوى الملف. */
export async function GET(request: Request, { params }: Params) {
  try {
    const result = await guard(request, { permission: PERMISSIONS.filesDownload });
    if (!result.authorized) return result.response;
    const { user, context } = result;

    const { id } = await params;
    const rows = await db.select().from(files).where(eq(files.id, id)).limit(1);
    const record = rows[0];
    if (!record) return fail("الملف غير موجود.", 404);

    if (record.quarantined) {
      if (!can(user.role, PERMISSIONS.filesQuarantine)) {
        await writeAuditLog({
          user,
          category: "files",
          action: AUDIT_ACTIONS.PERMISSION_DENIED,
          description: `محاولة تنزيل ملف معزول: ${record.originalName}`,
          status: "blocked",
          ip: context.ip,
          userAgent: context.userAgent,
        });
        return fail("الملف معزول ولا يمكن تنزيله قبل مراجعة المشرف الأمني.", 403, "QUARANTINED");
      }
    }

    const contentRows = await db.execute(sql`SELECT data FROM file_contents WHERE file_id = ${record.id}`);
    const data = (contentRows as unknown as { rows?: { data: Buffer }[] }).rows?.[0]?.data;
    if (!data) return fail("محتوى الملف غير متاح (ربما حُجز أثناء الفحص).", 410);

    await db.update(files).set({ downloadCount: sql`${files.downloadCount} + 1` }).where(eq(files.id, record.id));
    await writeAuditLog({
      user,
      category: "files",
      action: AUDIT_ACTIONS.FILE_DOWNLOAD,
      description: `تنزيل الملف ${record.originalName}`,
      status: "success",
      ip: context.ip,
      userAgent: context.userAgent,
      meta: { fileId: record.id },
    });

    const safeName = encodeURIComponent(record.originalName);
    return new Response(new Uint8Array(data), {
      headers: {
        ...SECURITY_HEADERS,
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="file-${record.id}"; filename*=UTF-8''${safeName}`,
        "Content-Length": String(data.length),
      },
    });
  } catch (error) {
    return handleUnknownError(error);
  }
}

const patchSchema = z.object({
  classification: z.string().min(1).max(40).optional(),
  sensitivity: z.enum(["عام", "خاص", "سري"]).optional(),
  quarantined: z.boolean().optional(),
});

/** PATCH — تعديل التصنيف/الحساسية أو تغيير حالة العزل. */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const result = await guard(request, {
      permission: PERMISSIONS.filesQuarantine,
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

    const rows = await db.select().from(files).where(eq(files.id, id)).limit(1);
    const record = rows[0];
    if (!record) return fail("الملف غير موجود.", 404);

    const updated = await db
      .update(files)
      .set({
        classification: parsed.data.classification ?? record.classification,
        sensitivity: parsed.data.sensitivity ?? record.sensitivity,
        quarantined: parsed.data.quarantined ?? record.quarantined,
      })
      .where(eq(files.id, id))
      .returning();

    const action =
      parsed.data.quarantined === true
        ? AUDIT_ACTIONS.FILE_QUARANTINE
        : parsed.data.quarantined === false
          ? AUDIT_ACTIONS.FILE_RELEASE
          : "FILE_UPDATE";

    await writeAuditLog({
      user,
      category: "files",
      action,
      description: `تحديث الملف ${record.originalName}${
        parsed.data.quarantined === undefined ? " (تصنيف/حساسية)" : parsed.data.quarantined ? " → عزل" : " → إخراج من العزل"
      }`,
      status: "success",
      ip: context.ip,
      userAgent: context.userAgent,
      meta: { fileId: id, patch: parsed.data },
    });

    return ok({ file: { ...updated[0]!, createdAt: updated[0]!.createdAt.toISOString() } });
  } catch (error) {
    return handleUnknownError(error);
  }
}

/** DELETE — حذف الملف ومحتواه. */
export async function DELETE(request: Request, { params }: Params) {
  try {
    const result = await guard(request, {
      permission: PERMISSIONS.filesDelete,
      write: true,
      requireSameOrigin: true,
    });
    if (!result.authorized) return result.response;
    const { user, context } = result;

    const { id } = await params;
    const rows = await db.select({ id: files.id, originalName: files.originalName }).from(files).where(eq(files.id, id)).limit(1);
    const record = rows[0];
    if (!record) return fail("الملف غير موجود.", 404);

    await db.delete(files).where(and(eq(files.id, id)));

    await writeAuditLog({
      user,
      category: "files",
      action: AUDIT_ACTIONS.FILE_DELETE,
      description: `حذف الملف ${record.originalName} نهائياً`,
      status: "success",
      ip: context.ip,
      userAgent: context.userAgent,
      meta: { fileId: id },
    });

    return ok({ deleted: true, id });
  } catch (error) {
    return handleUnknownError(error);
  }
}


