"use client";

/**
 * ============================================================================
 *  سياق الجلسة — إتاحة بيانات المستخدم وصلاحياته لكل صفحات اللوحة
 * ============================================================================
 *  يُغلَّف به المحتوى داخل AppShell، فتستطيع أي صفحة معرفة الدور الحالي
 *  وإظهار/إخفاء الأزرار دون طلب إضافي من الخادم.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { can, type Permission } from "@/lib/auth/rbac";
import type { Role } from "@/lib/types";
import type { ShellUser } from "@/components/AppShell";

type SessionContextValue = {
  user: ShellUser;
  /** هل يملك المستخدم الحالي صلاحية معينة؟ */
  allowed: (permission: Permission) => boolean;
  role: Role;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ user, children }: { user: ShellUser; children: ReactNode }) {
  const value = useMemo<SessionContextValue>(
    () => ({
      user,
      role: user.role,
      allowed: (permission: Permission) => can(user.role, permission),
    }),
    [user],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** الوصول إلى الجلسة الحالية داخل أي مكوّن عميل. */
export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession يجب أن يُستخدم داخل SessionProvider");
  return context;
}
