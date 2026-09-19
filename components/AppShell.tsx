"use client";

/**
 * ============================================================================
 *  هيكل التطبيق — الشريط الجانبي + الشريط العلوي + التنبيهات + قائمة المستخدم
 * ============================================================================
 *  - متجاوب بالكامل: على الجوال يتحول الشريط الجانبي إلى درج منزلِق.
 *  - العناصر تُعرض حسب صلاحيات الدور (RBAC على مستوى الواجهة أيضاً).
 *  - جرس التنبيهات يسحب أحدث التنبيهات الجديدة كل 20 ثانية.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { can, PERMISSIONS, ROLE_DESCRIPTIONS, type Permission } from "@/lib/auth/rbac";
import { cn, formatRelative, SEVERITY_LABELS, SEVERITY_STYLES, THREAT_TYPE_LABELS } from "@/lib/format";
import { BrandMark, Icon, type IconName } from "@/components/icons";
import { Badge, Button, Field, LiveDot, Modal, ToastProvider, useToast } from "@/components/ui";
import { SessionProvider } from "@/components/session-context";
import type { Role, SessionUser, Severity } from "@/lib/types";

type NavItem = { href: string; label: string; icon: IconName; permission: Permission; hint: string };

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "لوحة التحكم", icon: "dashboard", permission: PERMISSIONS.dashboardRead, hint: "المؤشرات الحية والدرجة الأمنية" },
  { href: "/alerts", label: "التنبيهات الأمنية", icon: "alerts", permission: PERMISSIONS.alertsRead, hint: "رصد ومعالجة التهديدات" },
  { href: "/files", label: "إدارة الملفات", icon: "files", permission: PERMISSIONS.filesRead, hint: "رفع وفحص وتصنيف" },
  { href: "/devices", label: "الأصول والأجهزة", icon: "devices", permission: PERMISSIONS.devicesRead, hint: "الإدارة الذكية للشبكة" },
  { href: "/reports", label: "التقارير الدورية", icon: "reports", permission: PERMISSIONS.reportsRead, hint: "تقارير أمنية وتصدير" },
  { href: "/audit", label: "سجل العمليات", icon: "audit", permission: PERMISSIONS.auditRead, hint: "تدقيق كامل لكل الإجراءات" },
  { href: "/users", label: "المستخدمون", icon: "users", permission: PERMISSIONS.usersRead, hint: "الحسابات والأدوار" },
];

export type ShellUser = SessionUser & { roleLabel: string; permissions: Permission[] };

type NotificationItem = {
  id: string;
  title: string;
  severity: Severity;
  type: string;
  detectedAt: string;
};

export default function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  return (
    <ToastProvider>
      {/* السياق يوفّر بيانات المستخدم وصلاحياته لكل صفحات اللوحة */}
      <SessionProvider user={user}>
        <ShellInner user={user}>{children}</ShellInner>
      </SessionProvider>
    </ToastProvider>
  );
}

function ShellInner({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [clock, setClock] = useState(() => new Date());
  const [passwordModal, setPasswordModal] = useState(false);
  const [healthOk, setHealthOk] = useState(true);
  const bellRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const visibleItems = useMemo(() => NAV_ITEMS.filter((item) => can(user.role as Role, item.permission)), [user.role]);
  const current = visibleItems.find((item) => pathname.startsWith(item.href)) ?? visibleItems[0];

  /* ------------------------------- ساعة حية ------------------------------- */
  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  /* ---------------------------- سحب التنبيهات ----------------------------- */
  const loadNotifications = useCallback(async () => {
    try {
      const data = await api.get<{ alerts: NotificationItem[] }>("/api/alerts?status=new&limit=6");
      setNotifications(data.alerts as NotificationItem[]);
    } catch {
      // تجاهل صامت: لا نزعج المستخدم عند أي انقطاع مؤقت
    }
  }, []);

  useEffect(() => {
    loadNotifications();
    const timer = window.setInterval(loadNotifications, 20_000);
    return () => window.clearInterval(timer);
  }, [loadNotifications]);

  /* ------------------------------ فحص الصحة ------------------------------- */
  useEffect(() => {
    const check = async () => {
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        setHealthOk(response.ok);
      } catch {
        setHealthOk(false);
      }
    };
    check();
    const timer = window.setInterval(check, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  /* ------------------ إغلاق القوائم عند النقر خارجها ---------------------- */
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(event.target as Node)) setBellOpen(false);
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  /* ---------------------- إغلاق الدرج عند تغيير الصفحة --------------------- */
  useEffect(() => setDrawerOpen(false), [pathname]);

  const handleLogout = async () => {
    try {
      await api.post("/api/auth/logout");
      toast.push("info", "تم تسجيل الخروج بأمان.");
      router.push("/login");
      router.refresh();
    } catch {
      router.push("/login");
    }
  };

  return (
    <div className="min-h-screen lg:flex">
      {/* ------------------------------ الشريط الجانبي ------------------------------ */}
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-40 flex w-[276px] flex-col border-l border-white/8 bg-abyss-900/95 backdrop-blur-2xl transition-transform duration-300 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          drawerOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex items-center gap-3 border-b border-white/8 px-5 py-4">
          <BrandMark className="h-10 w-10" />
          <div className="min-w-0">
            <p className="truncate text-base font-extrabold tracking-tight text-white">دِرْع</p>
            <p className="truncate text-[10px] text-cyan-300/80">منصة الأمن السيبراني والإدارة الذكية</p>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            className="mr-auto rounded-lg p-1.5 text-slate-400 hover:bg-white/8 hover:text-white lg:hidden"
            aria-label="إغلاق القائمة"
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">الوحدات</p>
          {visibleItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn("nav-link group", active && "nav-link-active")}
                title={item.hint}
              >
                <Icon name={item.icon} className={cn("h-[18px] w-[18px] shrink-0", active ? "text-cyan-300" : "text-slate-400 group-hover:text-cyan-300")} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{item.label}</span>
                  <span className="hidden truncate text-[10px] text-slate-500 xl:block">{item.hint}</span>
                </span>
                {item.href === "/alerts" && notifications.length > 0 && (
                  <span className="mono grid h-5 min-w-5 place-items-center rounded-full bg-rose-500/20 px-1 text-[10px] font-bold text-rose-200">
                    {notifications.length}
                  </span>
                )}
              </Link>
            );
          })}

          <div className="!mt-6 rounded-2xl border border-white/8 bg-gradient-to-b from-cyan-500/8 to-transparent p-4">
            <p className="flex items-center gap-2 text-[11px] font-bold text-cyan-200">
              <Icon name="key" className="h-3.5 w-3.5" />
              دورك الحالي
            </p>
            <p className="mt-1.5 text-sm font-bold text-white">{user.roleLabel}</p>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-400">{ROLE_DESCRIPTIONS[user.role as Role]}</p>
            <p className="mono mt-3 border-t border-white/8 pt-2 text-[10px] text-slate-500">
              {user.permissions.length} صلاحية مفعّلة
            </p>
          </div>
        </nav>

        <div className="border-t border-white/8 px-4 py-3">
          <div className="flex items-center justify-between text-[10px] text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <LiveDot tone={healthOk ? "emerald" : "rose"} />
              {healthOk ? "النظام يعمل" : "انقطاع في الاتصال"}
            </span>
            <span className="mono">v1.0.0</span>
          </div>
        </div>
      </aside>

      {/* خلفية معتمة للدرج على الجوال */}
      {drawerOpen && (
        <div className="fixed inset-0 z-30 bg-slate-950/70 backdrop-blur-sm lg:hidden" onClick={() => setDrawerOpen(false)} aria-hidden />
      )}

      {/* -------------------------------- المحتوى -------------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-20 border-b border-white/8 bg-abyss-950/85 backdrop-blur-xl">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
            <button
              onClick={() => setDrawerOpen(true)}
              className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:text-white lg:hidden"
              aria-label="فتح القائمة"
            >
              <Icon name="menu" className="h-5 w-5" />
            </button>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-sm font-bold text-white sm:text-base">{current?.label ?? "دِرْع"}</h1>
              <p className="mono hidden truncate text-[10px] text-slate-500 sm:block">
                {clock.toLocaleTimeString("ar-EG", { numberingSystem: "latn" })} — {user.fullName}
              </p>
            </div>

            {/* جرس التنبيهات */}
            <div className="relative" ref={bellRef}>
              <button
                onClick={() => setBellOpen((open) => !open)}
                className="relative rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:border-cyan-400/40 hover:text-white"
                aria-label={`التنبيهات (${notifications.length})`}
              >
                <Icon name="alerts" className="h-5 w-5" />
                {notifications.length > 0 && (
                  <span className="absolute -top-1 -left-1 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-[0_0_10px_rgba(244,63,94,0.8)]">
                    {notifications.length}
                  </span>
                )}
              </button>

              {bellOpen && (
                <div className="panel absolute left-0 mt-2 w-[min(92vw,340px)] animate-slide-up p-0">
                  <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
                    <p className="text-xs font-bold text-white">تنبيهات جديدة</p>
                    <LiveDot tone={notifications.length > 0 ? "rose" : "emerald"} />
                  </div>
                  <ul className="max-h-80 divide-y divide-white/5 overflow-y-auto">
                    {notifications.length === 0 && (
                      <li className="px-4 py-8 text-center text-[11px] text-slate-500">لا توجد تنبيهات مفتوحة — الوضع مستقر.</li>
                    )}
                    {notifications.map((item) => (
                      <li key={item.id}>
                        <Link href="/alerts" className="block px-4 py-3 transition hover:bg-white/5">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-[11px] font-semibold leading-snug text-slate-200">{item.title}</p>
                            <Badge className={cn("shrink-0", SEVERITY_STYLES[item.severity])}>{SEVERITY_LABELS[item.severity]}</Badge>
                          </div>
                          <p className="mono mt-1 text-[10px] text-slate-500">
                            {THREAT_TYPE_LABELS[item.type] ?? item.type} • {formatRelative(item.detectedAt)}
                          </p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <div className="border-t border-white/8 p-2">
                    <Link href="/alerts" className="btn-ghost w-full justify-center py-2 text-[11px]">
                      عرض كل التنبيهات
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* قائمة المستخدم */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setUserMenuOpen((open) => !open)}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 py-1.5 pl-2 pr-3 text-right transition hover:border-cyan-400/40"
                aria-label="حساب المستخدم"
              >
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-cyan-400 to-violet-500 text-[11px] font-bold text-slate-950">
                  {user.fullName.trim().charAt(0)}
                </span>
                <span className="hidden sm:block">
                  <span className="block text-[11px] font-bold leading-tight text-white">{user.fullName}</span>
                  <span className="block text-[9px] leading-tight text-cyan-300/80">{user.roleLabel}</span>
                </span>
                <Icon name="chevronDown" className="h-3.5 w-3.5 text-slate-400" />
              </button>

              {userMenuOpen && (
                <div className="panel absolute left-0 mt-2 w-[min(92vw,280px)] animate-slide-up p-2">
                  <div className="rounded-xl border border-white/8 bg-white/4 p-3">
                    <p className="text-xs font-bold text-white">{user.fullName}</p>
                    <p className="mono mt-0.5 text-[10px] text-slate-400">@{user.username}</p>
                    <p className="mono mt-0.5 text-[10px] text-slate-500">{user.email}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge className="border-cyan-400/30 bg-cyan-400/10 text-cyan-200">{user.roleLabel}</Badge>
                      {user.department && <Badge>{user.department}</Badge>}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      setPasswordModal(true);
                    }}
                    className="nav-link mt-1 w-full"
                  >
                    <Icon name="key" className="h-4 w-4 text-slate-400" />
                    تغيير كلمة المرور
                  </button>
                  <button onClick={handleLogout} className="nav-link w-full text-rose-200 hover:bg-rose-500/10 hover:text-rose-100">
                    <Icon name="logout" className="h-4 w-4" />
                    تسجيل الخروج
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* شريط التهديدات الحي */}
          <div className="relative overflow-hidden border-t border-white/6 bg-abyss-900/60">
            <div className="flex items-center gap-3 px-4 py-1.5">
              <span className="mono hidden shrink-0 items-center gap-1.5 text-[10px] font-bold text-rose-300 sm:flex">
                <LiveDot tone="rose" /> بث التهديدات
              </span>
              <div className="relative flex-1 overflow-hidden">
                <div className="flex w-max animate-marquee items-center gap-8 whitespace-nowrap">
                  {[...notifications, ...notifications, ...FALLBACK_TICKER].map((item, index) => (
                    <span key={`${item.title}-${index}`} className="mono text-[10px] text-slate-400">
                      <span className="text-cyan-300">◆</span> {item.title}
                      {"severity" in item ? ` — ${SEVERITY_LABELS[(item as NotificationItem).severity]}` : ""}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6">{children}</main>

        <footer className="no-print border-t border-white/6 px-4 py-4 text-center sm:px-6">
          <p className="mono text-[10px] text-slate-500">
            دِرْع © {new Date().getFullYear()} — كل العمليات مسجّلة ومشفّرة • الجلسة تنتهي تلقائياً بعد 8 ساعات
          </p>
        </footer>
      </div>

      {/* نافذة تغيير كلمة المرور */}
      <ChangePasswordModal open={passwordModal} onClose={() => setPasswordModal(false)} />
    </div>
  );
}

/** شريط احتياطي يظهر قبل ورود تنبيهات حقيقية. */
const FALLBACK_TICKER: { title: string }[] = [
  { title: "محرك الفحص DERAA-Heuristic v2.4 يعمل بكامل طاقته" },
  { title: "الجدار الناري يعترض الطلبات المشبوهة تلقائياً" },
  { title: "تشفير كلمات المرور bcrypt بعامل تكلفة 12" },
  { title: "قفل الحساب تلقائياً بعد 5 محاولات فاشلة" },
  { title: "مراقبة حية على مدار الساعة" },
];

/* -------------------------------------------------------------------------- */
/*                        نافذة تغيير كلمة المرور                              */
/* -------------------------------------------------------------------------- */

function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const strength = useMemo(() => {
    let score = 0;
    if (newPassword.length >= 10) score += 1;
    if (newPassword.length >= 14) score += 1;
    if (/[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword)) score += 1;
    if (/\d/.test(newPassword) && /[^A-Za-z0-9]/.test(newPassword)) score += 1;
    return score;
  }, [newPassword]);

  const submit = async () => {
    if (newPassword !== confirmPassword) {
      toast.push("error", "تأكيد كلمة المرور غير مطابق.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/api/auth/change-password", { currentPassword, newPassword });
      toast.push("success", "تم تغيير كلمة المرور بنجاح.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onClose();
    } catch (error) {
      toast.push("error", error instanceof Error ? error.message : "تعذر تغيير كلمة المرور.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="تغيير كلمة المرور"
      subtitle="سيتم إنهاء الجلسات الأخرى وإصدار جلسة جديدة"
      icon="key"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" icon="check" loading={loading} onClick={submit}>
            حفظ كلمة المرور
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Field label="كلمة المرور الحالية">
          <input type="password" className="field" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" />
        </Field>
        <Field label="كلمة المرور الجديدة" hint="10 أحرف + كبير + صغير + رقم">
          <input type="password" className="field" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" />
        </Field>
        <div className="flex items-center gap-1.5">
          {[0, 1, 2, 3].map((index) => (
            <span
              key={index}
              className={cn(
                "h-1.5 flex-1 rounded-full transition",
                index < strength ? (strength <= 1 ? "bg-rose-400" : strength === 2 ? "bg-amber-400" : "bg-emerald-400") : "bg-white/10",
              )}
            />
          ))}
          <span className="mono w-14 text-left text-[10px] text-slate-400">
            {["ضعيفة جداً", "ضعيفة", "متوسطة", "جيدة", "قوية"][strength]}
          </span>
        </div>
        <Field label="تأكيد كلمة المرور الجديدة">
          <input type="password" className="field" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" />
        </Field>
      </div>
    </Modal>
  );
}
