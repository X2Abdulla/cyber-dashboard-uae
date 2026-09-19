/**
 * ============================================================================
 *  /api/files — إدارة الملفات: قائمة + رفع مع فحص أمني كامل
 * ============================================================================
 *  GET  : قائمة الملفات مع فلاتر (الحكم، البحث، التصنيف، الحساسية).
 *  POST : رفع ملف (multipart/form-data) → فحص → تصنيف → تخزين أو حجز.
 */
import { desc, eq, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { alerts, files } from "@/db/schema";
import { fail, guard, handleUnknownError, ok } from "@/lib/api";
import { AUDIT_ACTIONS, writeAuditLog } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  MAX_FILE_SIZE,
  scanFile,
} from "@/lib/security/scanner";
import { sanitizeText } from "@/lib/security/request";
import { formatBytes } from "@/lib/format";

export const dynamic = "force-dynamic";

/** GET /api/files — قائمة الملفات (بدون المحتوى الثنائي). */
export async function GET(request: Request) {
  try {
    const result = await guard(request, { permission: PERMISSIONS.filesRead });
    if (!result.authorized) return result.response;

    const url = new URL(request.url);
    const search = sanitizeText(url.searchParams.get("q") ?? "", 60);
    const verdict = url.searchParams.get("verdict") ?? "";
    const sensitivity = url.searchParams.get("sensitivity") ?? "";
    const quarantined = url.searchParams.get("quarantined") ?? "";

    const conditions = [];
    if (verdict && ["clean", "suspicious", "malicious"].includes(verdict)) {
      conditions.push(eq(files.verdict, verdict as "clean" | "suspicious" | "malicious"));
    }
    if (sensitivity) conditions.push(eq(files.sensitivity, sensitivity));
    if (quarantined === "true") conditions.push(eq(files.quarantined, true));
    if (search) {
      conditions.push(or(like(files.originalName, `%${search}%`), like(files.classification, `%${search}%`))!);
    }

    const rows = await db
      .select({
        id: files.id,
        originalName: files.originalName,
        mimeType: files.mimeType,
        extension: files.extension,
        sizeBytes: files.sizeBytes,
        sha256: files.sha256,
        verdict: files.verdict,
        threatScore: files.threatScore,
        classification: files.classification,
        sensitivity: files.sensitivity,
        quarantined: files.quarantined,
        downloadCount: files.downloadCount,
        uploadedByName: files.uploadedByName,
        createdAt: files.createdAt,
        scanReport: files.scanReport,
      })
      .from(files)
      .where(conditions.length > 0 ? sql`(${sql.join(conditions, sql` AND `)})` : sql`1=1`)
      .orderBy(desc(files.createdAt))
      .limit(200);

    const summary = await db
      .select({
        total: sql<number>`count(*)::int`,
        clean: sql<number>`count(*) filter (where verdict = 'clean')::int`,
        suspicious: sql<number>`count(*) filter (where verdict = 'suspicious')::int`,
        malicious: sql<number>`count(*) filter (where verdict = 'malicious')::int`,
        quarantined: sql<number>`count(*) filter (where quarantined)::int`,
        size: sql<number>`coalesce(sum(size_bytes),0)::bigint`,
      })
      .from(files);

    const stats = summary[0] ?? { total: 0, clean: 0, suspicious: 0, malicious: 0, quarantined: 0, size: 0 };

    return ok({
      files: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), sizeLabel: formatBytes(row.sizeBytes) })),
      stats: { ...stats, size: Number(stats.size) },
    });
  } catch (error) {
    return handleUnknownError(error);
  }
}

const uploadSchema = z.object({
  classification: z.string().max(40).optional(),
  sensitivity: z.enum(["عام", "خاص", "سري"]).optional(),
  note: z.string().max(400).optional(),
});

/** POST /api/files — رفع وفحص ملف جديد. */
export async function POST(request: Request) {
  try {
    const result = await guard(request, {
      permission: PERMISSIONS.filesUpload,
      write: true,
      requireSameOrigin: true,
    });
    if (!result.authorized) return result.response;
    const { user, context } = result;

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return fail("تعذر قراءة بيانات الرفع. استخدم صيغة multipart/form-data.", 400);
    }

    const uploaded = form.get("file");
    if (!(uploaded instanceof File)) return fail("لم يتم إرفاق أي ملف.", 400);
    if (uploaded.size === 0) return fail("الملف فارغ.", 400);
    if (uploaded.size > MAX_FILE_SIZE) {
      return fail(`حجم الملف يتجاوز الحد المسموح (${formatBytes(MAX_FILE_SIZE)}).`, 413);
    }

    const meta = uploadSchema.safeParse({
      classification: form.get("classification") ? String(form.get("classification")) : undefined,
      sensitivity: form.get("sensitivity") ? String(form.get("sensitivity")) : undefined,
      note: form.get("note") ? String(form.get("note")) : undefined,
    });
    if (!meta.success) return fail("بيانات وصفية غير صالحة للملف.", 400);

    const originalName = sanitizeText(uploaded.name, 200) || "untitled";
    const buffer = Buffer.from(await uploaded.arrayBuffer());

    /* --- الفحص الأمني --- */
    const scan = scanFile({ fileName: originalName, buffer });

    /* --- الملفات الضارة تُرفض ولا تُخزَّن إطلاقاً --- */
    if (scan.verdict === "malicious") {
      await db.insert(alerts).values({
        type: "malware",
        title: `حجز ملف ضار: ${originalName}`,
        description: `منع المحرك ${scan.engine} رفع الملف (درجة التهديد ${scan.threatScore}/100). القواعد: ${scan.detections
          .map((d) => d.rule)
          .join("، ") || "لا يوجد"}.`,
        severity: "critical",
        status: "new",
        sourceIp: context.ip,
        target: "بوابة رفع الملفات",
        deviceName: null,
        riskScore: scan.threatScore,
        detectedAt: new Date(),
      });

      await writeAuditLog({
        user,
        category: "files",
        action: AUDIT_ACTIONS.FILE_SCAN_BLOCKED,
        description: `حجز الملف ${originalName} بعد اكتشاف تهديد (درجة ${scan.threatScore})`,
        status: "blocked",
        ip: context.ip,
        userAgent: context.userAgent,
        meta: { sha256: scan.sha256, detections: scan.detections, size: buffer.length },
      });

      return NextResponseJsonBlocked({ originalName, scan });
    }

    /* --- التخزين (المحتوى في جدول معزول) --- */
    const extension = originalName.includes(".") ? originalName.split(".").pop()!.toLowerCase().slice(0, 20) : "";
    // اسم تخزين عشوائي يمنع أي محاولة لتجاوز المسار (Path Traversal).
    const storedName = `${crypto.randomUUID()}${extension ? `.${extension}` : ""}`;
    const classification = meta.data.classification?.trim() || scan.classification;
    const sensitivity = meta.data.sensitivity ?? scan.sensitivity;
    const quarantined = scan.verdict === "suspicious";

    const inserted = await db
      .insert(files)
      .values({
        storedName,
        originalName,
        mimeType: uploaded.type || "application/octet-stream",
        extension: originalName.includes(".") ? originalName.split(".").pop()!.toLowerCase() : "",
        sizeBytes: buffer.length,
        sha256: scan.sha256,
        verdict: scan.verdict,
        threatScore: scan.threatScore,
        classification,
        sensitivity,
        quarantined,
        scanReport: scan as unknown as Record<string, unknown>,
        uploadedById: user.id,
        uploadedByName: user.fullName,
      })
      .returning();

    const record = inserted[0]!;
    await db.execute(sql`INSERT INTO file_contents (file_id, data) VALUES (${record.id}, ${buffer})`);

    await writeAuditLog({
      user,
      category: "files",
      action: AUDIT_ACTIONS.FILE_UPLOAD,
      description: `رفع الملف ${originalName} (${formatBytes(buffer.length)}) — الحكم: ${scan.verdict === "clean" ? "سليم" : "مشبوه"}${quarantined ? " (تم العزل التلقائي)" : ""}`,
      status: "success",
      ip: context.ip,
      userAgent: context.userAgent,
      meta: { fileId: record.id, sha256: scan.sha256, threatScore: scan.threatScore, note: meta.data.note },
    });

    if (quarantined) {
      await db.insert(alerts).values({
        type: "malware",
        title: `ملف مشبوه قيد العزل: ${originalName}`,
        description: `درجة التهديد ${scan.threatScore}/100 — تمت المطابقة مع: ${scan.detections.map((d) => d.rule).join("، ")}.`,
        severity: scan.threatScore >= 55 ? "high" : "medium",
        status: "new",
        sourceIp: context.ip,
        target: "بوابة رفع الملفات",
        riskScore: scan.threatScore,
        detectedAt: new Date(),
      });
    }

    return ok({
      file: { ...record, createdAt: record.createdAt.toISOString(), sizeLabel: formatBytes(record.sizeBytes) },
      scan,
      quarantined,
    }, { status: 201 });
  } catch (error) {
    return handleUnknownError(error);
  }
}

/** رد مخصص لحالة الحجب (422) مع تقرير الفحص الكامل. */
function NextResponseJsonBlocked(payload: { originalName: string; scan: ReturnType<typeof scanFile> }) {
  return new Response(
    JSON.stringify({
      ok: false,
      error: `تم حظر رفع الملف «${payload.originalName}» لأنه مصنف كملف ضار.`,
      code: "MALICIOUS_FILE",
      data: { scan: payload.scan },
    }),
    { status: 422, headers: { "Content-Type": "application/json; charset=utf-8" } },
  );
}
