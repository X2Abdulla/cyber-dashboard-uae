import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth/session";
import { ensureDbReady } from "@/db/bootstrap";
import AppShell, { type ShellUser } from "@/components/AppShell";
import { PERMISSIONS, ROLE_LABELS, can } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * تخطيط اللوحة المحمي:
 *  - يتحقق من الجلسة في الخادم قبل عرض أي محتوى.
 *  - يمرّر المستخدم وصلاحياته إلى الهيكل (AppShell).
 */
export default async function PanelLayout({ children }: { children: ReactNode }) {
  await ensureDbReady();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const shellUser: ShellUser = {
    ...user,
    roleLabel: ROLE_LABELS[user.role],
    permissions: Object.values(PERMISSIONS).filter((permission) => can(user.role, permission)),
  };

  return <AppShell user={shellUser}>{children}</AppShell>;
}
