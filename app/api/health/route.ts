/**
 * GET /api/health — فحص جاهزية الخدمة وقاعدة البيانات.
 * يُستخدم من منصة التشغيل ومن لوحة الحالة داخل النظام.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureDbReady } from "@/db/bootstrap";
import { SECURITY_HEADERS } from "@/lib/security/request";
import { SCANNER_VERSION } from "@/lib/security/scanner";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    await ensureDbReady();
    await db.execute(sql`select 1`);
    return Response.json(
      {
        ok: true,
        service: "DERAA Security Platform",
        version: "1.0.0",
        scanner: SCANNER_VERSION,
        database: "connected",
        latencyMs: Date.now() - started,
        timestamp: new Date().toISOString(),
      },
      { headers: SECURITY_HEADERS },
    );
  } catch (error) {
    console.error("[health] فشل فحص الصحة:", error);
    return Response.json({ ok: false, database: "unreachable" }, { status: 500 });
  }
}
