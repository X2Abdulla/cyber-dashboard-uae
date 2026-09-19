/**
 * /api/users — إدارة الحسابات (مدير: كامل، مشرف: قراءة فقط).
 */
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { fail, guard, handleUnknownError, ok, readJson } from "@/lib/api";
import { AUDIT_ACTIONS, writeAuditLog } from "@/lib/audit";
import { PERMISSIONS, ROLE_LABELS } from "@/lib/auth/rbac";
import { hashPassword, validatePasswordPolicy } from "@/lib/auth/password";
import { sanitizeText } from "@/lib/security/request";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

/** إسقاط أي حقول حساسة قبل الإرسال للواجهة. */
function publicUser(row: typeof users.$inferSelect) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    fullName: row.fullName,
    role: row.role as Role,
    roleLabel: ROLE_LABELS[row.role as Role],
    status: row.status,
    department: row.department,
    failedAttempts: row.failedAttempts,
    lockedUntil: row.lockedUntil?.toISOString() ?? null,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    lastLoginIp: row.lastLoginIp,
    mustChangePassword: row.mustChangePassword,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function GET(request: Request) {
  try {
    const result = await guard(request, { permission: PERMISSIONS.usersRead });
    if (!result.authorized) return result.response;

    const rows = await db.select().from(users).orderBy(desc(users.createdAt)).limit(200);
    const stats = await db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where status='active')::int`,
        suspended: sql<number>`count(*) filter (where status='suspended')::int`,
        admins: sql<number>`count(*) filter (where role='admin')::int`,
        supervisors: sql<number>`count(*) filter (where role='supervisor')::int`,
        locked: sql<number>`count(*) filter (where locked_until > now())::int`,
      })
      .from(users);

    return ok({
      users: rows.map(publicUser),
      stats: stats[0] ?? { total: 0, active: 0, suspended: 0, admins: 0, supervisors: 0, locked: 0 },
      roles: (Object.keys(ROLE_LABELS) as Role[]).map((role) => ({ value: role, label: ROLE_LABELS[role] })),
    });
  } catch (error) {
    return handleUnknownError(error);
  }
}

const createSchema = z.object({
  username: z.string().trim().min(3).max(48).regex(/^[a-zA-Z0-9._-]+$/, "اسم المستخدم بأحرف إنجليزية وأرقام فقط."),
  email: z.string().email("البريد الإلكتروني غير صالح.").max(160),
  fullName: z.string().min(2).max(120),
  password: z.string().min(1).max(200),
  role: z.enum(["admin", "supervisor", "user"]),
  department: z.string().max(80).optional(),
});

export async function POST(request: Request) {
  try {
    const result = await guard(request, {
      permission: PERMISSIONS.usersManage,
      write: true,
      requireSameOrigin: true,
    });
    if (!result.authorized) return result.response;
    const { user, context } = result;

    const body = await readJson<z.infer<typeof createSchema>>(request);
    if (body.error) return fail(body.error);
    const parsed = createSchema.safeParse(body.data);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "بيانات المستخدم غير صالحة.");

    const policyIssues = validatePasswordPolicy(parsed.data.password);
    if (policyIssues.length > 0) return fail(policyIssues[0]!.message);

    const duplicate = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`${users.username} = ${parsed.data.username.toLowerCase()} OR ${users.email} = ${parsed.data.email.toLowerCase()}`)
      .limit(1);
    if (duplicate.length > 0) return fail("اسم المستخدم أو البريد الإلكتروني مستخدم مسبقاً.", 409);

    const passwordHash = await hashPassword(parsed.data.password);
    const inserted = await db
      .insert(users)
      .values({
        username: parsed.data.username.toLowerCase(),
        email: parsed.data.email.toLowerCase(),
        fullName: sanitizeText(parsed.data.fullName, 120),
        passwordHash,
        role: parsed.data.role,
        department: parsed.data.department ? sanitizeText(parsed.data.department, 80) : null,
        mustChangePassword: true,
      })
      .returning();

    await writeAuditLog({
      user,
      category: "users",
      action: AUDIT_ACTIONS.USER_CREATE,
      description: `إنشاء حساب ${inserted[0]!.username} بدور ${ROLE_LABELS[parsed.data.role]}`,
      status: "success",
      ip: context.ip,
      userAgent: context.userAgent,
      meta: { userId: inserted[0]!.id, role: parsed.data.role },
    });

    return ok({ user: publicUser(inserted[0]!) }, { status: 201 });
  } catch (error) {
    return handleUnknownError(error);
  }
}
