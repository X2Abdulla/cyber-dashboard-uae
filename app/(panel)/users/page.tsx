"use client";

/**
 * ============================================================================
 *  إدارة المستخدمين والأدوار
 * ============================================================================
 *  - المدير: إنشاء/تعديل/حذف الحسابات، تغيير الأدوار، إعادة تعيين كلمة المرور،
 *    فك قفل الحسابات، وإيقاف/تفعيل الحساب.
 *  - المشرف: قراءة فقط (حسب مصفوفة الصلاحيات).
 *  - كل تعديل يُسجَّل في سجل العمليات.
 */
import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/session-context";
import { Icon } from "@/components/icons";
import { Badge, Button, EmptyState, ErrorState, Field, LoadingBlock, Modal, Panel, useToast } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";
import { cn, formatDateTime, formatNumber, formatRelative, ROLE_LABELS_MAP, ROLE_STYLES } from "@/lib/format";
import { PERMISSIONS, ROLE_DESCRIPTIONS } from "@/lib/auth/rbac";
import type { Role } from "@/lib/types";

type UserRow = {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: Role;
  roleLabel: string;
  status: "active" | "suspended";
  department: string | null;
  failedAttempts: number;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  mustChangePassword: boolean;
  createdAt: string;
};

type UserStats = { total: number; active: number; suspended: number; admins: number; supervisors: number; locked: number };

export default function UsersPage() {
  const { allowed, user: currentUser } = useSession();
  const toast = useToast();
  const canManage = allowed(PERMISSIONS.usersManage);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [stats, setStats] = useState<UserStats>({ total: 0, active: 0, suspended: 0, admins: 0, supervisors: 0, locked: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ users: UserRow[]; stats: UserStats }>("/api/users");
      setUsers(data.users);
      setStats(data.stats);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "تعذر تحميل المستخدمين.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const patchUser = async (target: UserRow, body: Record<string, unknown>, message: string) => {
    setBusy(true);
    try {
      await api.patch(`/api/users/${target.id}`, body);
      toast.push("success", message);
      setEditing(null);
      await load();
    } catch (caught) {
      toast.push("error", caught instanceof ApiError ? caught.message : "تعذر تحديث الحساب.");
    } finally {
      setBusy(false);
    }
  };

  const removeUser = async (target: UserRow) => {
    setBusy(true);
    try {
      await api.delete(`/api/users/${target.id}`);
      toast.push("success", `تم حذف حساب ${target.username}.`);
      setEditing(null);
      await load();
    } catch (caught) {
      toast.push("error", caught instanceof ApiError ? caught.message : "تعذر حذف الحساب.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <UserStat label="إجمالي الحسابات" value={stats.total} tone="cyan" icon="users" />
        <UserStat label="نشطة" value={stats.active} tone="mint" icon="check" />
        <UserStat label="موقوفة" value={stats.suspended} tone="amber" icon="lock" />
        <UserStat label="مدراء النظام" value={stats.admins} tone="violet" icon="shield" />
        <UserStat label="حسابات مقفلة" value={stats.locked} tone="rose" icon="warning" hint="بسبب محاولات فاشلة" />
      </div>

      <Panel
        title="الحسابات والأدوار"
        subtitle={canManage ? "تحكم كامل بالصلاحيات والحالات" : "عرض للقراءة فقط حسب صلاحيات دورك"}
        icon="users"
        actions={
          <>
            {canManage && (
              <Button variant="primary" icon="plus" className="px-3 py-1.5 text-[11px]" onClick={() => setCreateOpen(true)}>
                حساب جديد
              </Button>
            )}
            <Button variant="ghost" icon="refresh" className="px-3 py-1.5 text-[11px]" onClick={load}>
              تحديث
            </Button>
          </>
        }
      >
        {loading && users.length === 0 ? (
          <LoadingBlock label="جارٍ تحميل الحسابات..." />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : users.length === 0 ? (
          <EmptyState icon="users" title="لا توجد حسابات" />
        ) : (
          <div className="space-y-2.5">
            {users.map((row) => {
              const locked = row.lockedUntil ? new Date(row.lockedUntil).getTime() > Date.now() : false;
              const isSelf = row.id === currentUser.id;
              return (
                <article key={row.id} className="panel panel-hover p-3.5">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 text-sm font-bold text-slate-950">
                      {row.fullName.trim().charAt(0)}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-[13px] font-bold text-white">{row.fullName}</p>
                        <Badge className={ROLE_STYLES[row.role]}>{ROLE_LABELS_MAP[row.role]}</Badge>
                        <Badge className={row.status === "active" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-rose-500/35 bg-rose-500/12 text-rose-200"}>
                          {row.status === "active" ? "نشط" : "موقوف"}
                        </Badge>
                        {locked && <Badge className="border-amber-500/35 bg-amber-500/12 text-amber-200" dot>مقفل مؤقتاً</Badge>}
                        {row.mustChangePassword && <Badge className="border-cyan-400/25 bg-cyan-400/8 text-cyan-200">مطلوب تغيير كلمة المرور</Badge>}
                        {isSelf && <Badge className="border-violet-400/30 bg-violet-400/10 text-violet-200">حسابك الحالي</Badge>}
                      </div>
                      <p className="mono mt-1 truncate text-[10px] text-slate-500" dir="ltr">
                        @{row.username} • {row.email}
                      </p>
                      <p className="mono mt-0.5 truncate text-[10px] text-slate-500">
                        {row.department ?? "بدون قسم"} • آخر دخول {row.lastLoginAt ? formatRelative(row.lastLoginAt) : "لم يسبق"} {row.lastLoginIp ? `من ${row.lastLoginIp}` : ""} •
                        محاولات فاشلة: {row.failedAttempts}
                      </p>
                    </div>

                    {canManage && (
                      <div className="flex flex-wrap gap-2">
                        <Button variant="ghost" icon="settings" className="px-2.5 py-1.5 text-[11px]" onClick={() => setEditing(row)}>
                          إدارة
                        </Button>
                        {locked && (
                          <Button variant="soft" icon="unlock" className="px-2.5 py-1.5 text-[11px]" disabled={busy} onClick={() => patchUser(row, { unlock: true }, `تم فك قفل حساب ${row.username}.`)}>
                            فك القفل
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="مصفوفة الصلاحيات" subtitle="مرجع سريع لما يسمح به كل دور" icon="shield">
        <div className="grid gap-3 lg:grid-cols-3">
          {(Object.keys(ROLE_LABELS_MAP) as Role[]).map((role) => (
            <div key={role} className="rounded-xl border border-white/8 bg-white/3 p-4">
              <div className="flex items-center gap-2">
                <Badge className={ROLE_STYLES[role]}>{ROLE_LABELS_MAP[role]}</Badge>
                <Icon name="key" className="h-3.5 w-3.5 text-slate-500" />
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{ROLE_DESCRIPTIONS[role]}</p>
            </div>
          ))}
        </div>
      </Panel>

      <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={load} />

      {/* ------------------------------ إدارة حساب ------------------------------ */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `إدارة حساب ${editing.fullName}` : ""}
        subtitle={editing ? `@${editing.username} • أُنشئ في ${formatDateTime(editing.createdAt)}` : undefined}
        icon="settings"
        footer={
          editing ? (
            <>
              <Button variant="danger" icon="trash" loading={busy} disabled={editing.id === currentUser.id} onClick={() => removeUser(editing)}>
                حذف الحساب
              </Button>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                إغلاق
              </Button>
            </>
          ) : undefined
        }
      >
        {editing && <EditUserForm user={editing} busy={busy} onSubmit={patchUser} />}
      </Modal>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function EditUserForm({
  user,
  busy,
  onSubmit,
}: {
  user: UserRow;
  busy: boolean;
  onSubmit: (target: UserRow, body: Record<string, unknown>, message: string) => void;
}) {
  const toast = useToast();
  const [role, setRole] = useState<Role>(user.role);
  const [status, setStatus] = useState<"active" | "suspended">(user.status);
  const [fullName, setFullName] = useState(user.fullName);
  const [department, setDepartment] = useState(user.department ?? "");
  const [newPassword, setNewPassword] = useState("");

  return (
    <div className="space-y-3.5">
      <Field label="الاسم الكامل">
        <input className="field" value={fullName} onChange={(event) => setFullName(event.target.value)} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="الدور">
          <select className="field" value={role} onChange={(event) => setRole(event.target.value as Role)}>
            {(Object.keys(ROLE_LABELS_MAP) as Role[]).map((key) => (
              <option key={key} value={key}>
                {ROLE_LABELS_MAP[key]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="الحالة">
          <select className="field" value={status} onChange={(event) => setStatus(event.target.value as "active" | "suspended")}>
            <option value="active">نشط</option>
            <option value="suspended">موقوف</option>
          </select>
        </Field>
      </div>
      <p className="rounded-xl border border-white/8 bg-white/3 p-3 text-[10px] leading-relaxed text-slate-400">{ROLE_DESCRIPTIONS[role]}</p>
      <Field label="القسم">
        <input className="field" value={department} onChange={(event) => setDepartment(event.target.value)} placeholder="الأمن السيبراني" />
      </Field>
      <Field label="كلمة مرور جديدة" hint="اتركها فارغة لعدم التغيير">
        <input className="field" type="text" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="10 أحرف + كبير + صغير + رقم" dir="ltr" />
      </Field>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          icon="check"
          loading={busy}
          onClick={() =>
            onSubmit(user, { fullName, role, status, department, ...(newPassword ? { newPassword } : {}) }, `تم تحديث حساب ${user.username}.`)
          }
        >
          حفظ التعديلات
        </Button>
        <Button variant="soft" icon="unlock" loading={busy} onClick={() => onSubmit(user, { unlock: true }, `تم فك قفل ${user.username}.`)}>
          فك القفل وإعادة العدّاد
        </Button>
        <Button
          variant="ghost"
          icon="key"
          loading={busy}
          onClick={() => {
            if (!newPassword) {
              toast.push("error", "اكتب كلمة المرور الجديدة أولاً.");
              return;
            }
            onSubmit(user, { newPassword }, "تمت إعادة تعيين كلمة المرور — سيُطلب منه تغييرها عند أول دخول.");
          }}
        >
          إعادة تعيين كلمة المرور فقط
        </Button>
      </div>
    </div>
  );
}

function CreateUserModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ username: "", email: "", fullName: "", password: "", role: "user" as Role, department: "" });

  const submit = async () => {
    setBusy(true);
    try {
      await api.post("/api/users", form);
      toast.push("success", `تم إنشاء حساب ${form.username} — سيُطلب منه تغيير كلمة المرور عند أول دخول.`);
      setForm({ username: "", email: "", fullName: "", password: "", role: "user", department: "" });
      onClose();
      onCreated();
    } catch (caught) {
      toast.push("error", caught instanceof ApiError ? caught.message : "تعذر إنشاء الحساب.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="إنشاء حساب جديد"
      subtitle="كلمة المرور تُشفَّر بـ bcrypt قبل التخزين"
      icon="users"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" icon="check" loading={busy} onClick={submit}>
            إنشاء الحساب
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="الاسم الكامل">
          <input className="field" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} placeholder="سارة العتيبي" />
        </Field>
        <Field label="اسم المستخدم" hint="أحرف إنجليزية">
          <input className="field" dir="ltr" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="s.otaibi" />
        </Field>
        <Field label="البريد الإلكتروني">
          <input className="field" dir="ltr" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="name@company.com" />
        </Field>
        <Field label="الدور">
          <select className="field" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as Role })}>
            {(Object.keys(ROLE_LABELS_MAP) as Role[]).map((key) => (
              <option key={key} value={key}>
                {ROLE_LABELS_MAP[key]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="كلمة المرور المؤقتة" hint="10 أحرف + كبير + صغير + رقم" className="sm:col-span-2">
          <input className="field" dir="ltr" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Temp@2026Pass" />
        </Field>
        <Field label="القسم" hint="اختياري" className="sm:col-span-2">
          <input className="field" value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} placeholder="مركز العمليات الأمنية" />
        </Field>
      </div>
      <p className={cn("mono mt-3 text-[10px] leading-relaxed text-slate-500")}>
        ملاحظة أمنية: الحسابات الجديدة تُنشأ بحالة «مطلوب تغيير كلمة المرور» وتُسجَّل عملية الإنشاء في سجل العمليات.
      </p>
    </Modal>
  );
}

function UserStat({
  label,
  value,
  tone,
  icon,
  hint,
}: {
  label: string;
  value: number;
  tone: "cyan" | "mint" | "amber" | "rose" | "violet";
  icon: "users" | "check" | "lock" | "shield" | "warning";
  hint?: string;
}) {
  const tones = {
    cyan: "border-cyan-400/25 text-cyan-300",
    mint: "border-emerald-400/25 text-emerald-300",
    amber: "border-amber-400/25 text-amber-300",
    rose: "border-rose-400/25 text-rose-300",
    violet: "border-violet-400/25 text-violet-300",
  };
  return (
    <div className={cn("panel p-3.5", tones[tone])}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] text-slate-400">{label}</p>
          <p className="stat-value mt-1">{formatNumber(value)}</p>
          {hint && <p className="mono mt-1 truncate text-[9px] text-slate-500">{hint}</p>}
        </div>
        <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl border bg-white/4", tones[tone])}>
          <Icon name={icon} className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}
