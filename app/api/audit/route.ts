/**
 * GET /api/audit — سجل العمليات الكامل مع فلاتر وترقيم صفحات.
 * الفلاتر: category, status, action, q (مستخدم/وصف), page, pageSize, hours.
 */
import { and, desc, gte, like, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { guard, handleUnknownError, ok } from "@/lib/api";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { sanitizeText } from "@/lib/security/request";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const result = await guard(request, { permission: PERMISSIONS.auditRead });
    if (!result.authorized) return result.response;

    const url = new URL(request.url);
    const category = url.searchParams.get("category") ?? "";
    const status = url.searchParams.get("status") ?? "";
    const action = url.searchParams.get("action") ?? "";
    const search = sanitizeText(url.searchParams.get("q") ?? "", 60);
    const hours = Number(url.searchParams.get("hours") ?? 0);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const pageSize = Math.min(200, Math.max(10, Number(url.searchParams.get("pageSize") ?? 25)));

    const conditions = [];
    if (["auth", "files", "alerts", "users", "devices", "reports", "system"].includes(category)) {
      conditions.push(sql`${auditLogs.category} = ${category}`);
    }
    if (["success", "failure", "blocked"].includes(status)) {
      conditions.push(sql`${auditLogs.status} = ${status}`);
    }
    if (action) conditions.push(sql`${auditLogs.action} = ${action}`);
    if (hours > 0) conditions.push(gte(auditLogs.createdAt, sql`now() - (${hours} || ' hours')::interval`));
    if (search) {
      conditions.push(
        or(like(auditLogs.username, `%${search}%`), like(auditLogs.description, `%${search}%`), like(auditLogs.ip, `%${search}%`))!,
      );
    }

    const where = conditions.length > 0 ? and(...conditions)! : sql`1=1`;

    const [rows, countRows, summaryRows] = await Promise.all([
      db
        .select({
          id: auditLogs.id,
          userId: auditLogs.userId,
          username: auditLogs.username,
          category: auditLogs.category,
          action: auditLogs.action,
          description: auditLogs.description,
          status: auditLogs.status,
          ip: auditLogs.ip,
          userAgent: auditLogs.userAgent,
          meta: auditLogs.meta,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .where(where)
        .orderBy(desc(auditLogs.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ count: sql<number>`count(*)::int` }).from(auditLogs).where(where),
      db
        .select({
          success: sql<number>`count(*) filter (where status='success')::int`,
          failure: sql<number>`count(*) filter (where status='failure')::int`,
          blocked: sql<number>`count(*) filter (where status='blocked')::int`,
          total: sql<number>`count(*)::int`,
        })
        .from(auditLogs),
    ]);

    const total = countRows[0]?.count ?? 0;

    return ok({
      logs: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
      summary: summaryRows[0] ?? { success: 0, failure: 0, blocked: 0, total: 0 },
      pagination: { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) },
    });
  } catch (error) {
    return handleUnknownError(error);
  }
}
