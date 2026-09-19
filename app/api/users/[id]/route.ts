/**
 * /api/users/[id] — تعديل الدور/الحالة، إعادة تعيين كلمة المرور، فك القفل، والحذف.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { fail, guard, handleUnknownError, ok, readJson } from "@/lib/api";
import { AUDIT_ACTIONS, writeAuditLog } from "@/lib/audit";
import { PERMISSIONS, ROLE_LABELS } from "@/lib/auth/rbac";
import { hashPassword, validatePasswordPolicy } from "@/lib/auth/password";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  fullName: z.string().min(2).max(120).optional(),
  email: z.string().email().max(160).optional(),
  role: z.enum(["admin", "supervisor", "user"]).optional(),
  status: z.enum(["active", "suspended"]).optional(),
  department: z.string().max(80).optional(),
  newPassword: z.string().min(1).max(200).optional(),
  unlock: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  try {
    const result = await guard(request, {
      permission: PERMISSIONS.usersManage,
      write: true,
      requireSameOrigin: true,
    });
    if (!result.authorized) return result.response;
    const { user: actor, context } = result;

    const { id } = await params;
    const body = await readJson<z.infer<typeof patchSchema>>(request);
    if (body.error) return fail(body.error);
    const parsed = patchSchema.safeParse(body.data);
    if (!parsed.success) return fail("بيانات التعديل غير صالحة.");

    const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    const target = rows[0];
    if (!target) return fail("المستخدم غير موجود.", 404);

    // حماية: لا يمكن للمدير تخفيض صلاحياته أو إيقاف/حذف نفسه.
    if (target.id === actor.id && (parsed.data.role || parsed.data.status === "suspended")) {
      return fail("لا يمكنك تعديل دورك أو إيقاف حسابك بنفسك.", 403);
    }
    // حماية: يجب أن يبقى مدير واحد على الأقل في النظام.
    if (target.role === "admin" && parsed.data.role && parsed.data.role !== "admin") {
      const adminCount = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
      if (adminCount.length <= 1) return fail("لا يمكن تخفيض دور آخر مدير في النظام.", 403);
    }

    const updates: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
    if (parsed.data.fullName) updates.fullName = parsed.data.fullName;
    if (parsed.data.email) updates.email = parsed.data.email.toLowerCase();
    if (parsed.data.role) updates.role = parsed.data.role;
    if (parsed.data.status) updates.status = parsed.data.status;
    if (parsed.data.department !== undefined) updates.department = parsed.data.department || null;
    if (parsed.data.unlock) {
      updates.failedAttempts = 0;
      updates.lockedUntil = null;
    }
    if (parsed.data.newPassword) {
      const issues = validatePasswordPolicy(parsed.data.newPassword);
      if (issues.length > 0) return fail(issues[0]!.message);
      updates.passwordHash = await hashPassword(parsed.data.newPassword);
      updates.mustChangePassword = true;
      updates.failedAttempts = 0;
      updates.lockedUntil = null;
    }

    const updated = await db.update(users).set(updates).where(eq(users.id, id)).returning();

    const changes: string[] = [];
    if (parsed.data.role) changes.push(`الدور → ${ROLE_LABELS[parsed.data.role]}`);
    if (parsed.data.status) changes.push(`الحالة → ${parsed.data.status === "active" ? "نشط" : "موقوف"}`);
    if (parsed.data.newPassword) changes.push("إعادة تعيين كلمة المرور");
    if (parsed.data.unlock) changes.push("فك قفل الحساب");

    await writeAuditLog({
      user: actor,
      category: "users",
      action: parsed.data.newPassword ? AUDIT_ACTIONS.USER_PASSWORD_RESET : AUDIT_ACTIONS.USER_UPDATE,
      description: `تعديل حساب ${target.username}${changes.length ? `: ${changes.join("، ")}` : ""}`,
      status: "success",
      ip: context.ip,
      userAgent: context.userAgent,
      meta: { userId: id, changes: parsed.data.newPassword ? ["newPassword"] : Object.keys(parsed.data) },
    });

    const record = updated[0]!;
    return ok({
      user: {
        id: record.id,
        username: record.username,
        email: record.email,
        fullName: record.fullName,
        role: record.role as Role,
        roleLabel: ROLE_LABELS[record.role as Role],
        status: record.status,
        department: record.department,
        failedAttempts: record.failedAttempts,
        lockedUntil: record.lockedUntil?.toISOString() ?? null,
        lastLoginAt: record.lastLoginAt?.toISOString() ?? null,
        lastLoginIp: record.lastLoginIp,
        mustChangePassword: record.mustChangePassword,
        createdAt: record.createdAt.toISOString(),
      },
    });
  } catch (error) {
    return handleUnknownError(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const result = await guard(request, {
      permission: PERMISSIONS.usersManage,
      write: true,
      requireSameOrigin: true,
    });
    if (!result.authorized) return result.response;
    const { user: actor, context } = result;

    const { id } = await params;
    if (id === actor.id) return fail("لا يمكنك حذف حسابك الحالي.", 403);

    const rows = await db.select({ id: users.id, username: users.username, role: users.role }).from(users).where(eq(users.id, id)).limit(1);
    const target = rows[0];
    if (!target) return fail("المستخدم غير موجود.", 404);

    if (target.role === "admin") {
      const adminCount = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
      if (adminCount.length <= 1) return fail("لا يمكن حذف آخر مدير في النظام.", 403);
    }

    await db.delete(users).where(eq(users.id, id));
    await writeAuditLog({
      user: actor,
      category: "users",
      action: AUDIT_ACTIONS.USER_DELETE,
      description: `حذف حساب ${target.username}`,
      status: "success",
      ip: context.ip,
      userAgent: context.userAgent,
      meta: { userId: id },
    });

    return ok({ deleted: true, id });
  } catch (error) {
    return handleUnknownError(error);
  }
}
