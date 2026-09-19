"use client";

/**
 * ============================================================================
 *  صفحة تسجيل الدخول — واجهة عربية بتصميم مركز عمليات أمنية
 * ============================================================================
 *  تعرض رسائل الخطأ الآتية من الخادم كما هي (قفل حساب، تجاوز حد المحاولات،
 *  حساب موقوف...) دون كشف أي معلومة عن صحة اسم المستخدم.
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandMark, Icon } from "@/components/icons";
import { Badge, Button, Field, LiveDot, Spinner } from "@/components/ui";
import { ApiError, api } from "@/lib/client/api";
import { cn } from "@/lib/format";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [capsLock, setCapsLock] = useState(false);
  const [checking, setChecking] = useState(true);

  /* إذا كانت هناك جلسة صالحة فانتقل مباشرة إلى اللوحة. */
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await api.get<{ user: { username: string } | null }>("/api/auth/session");
        if (active && data.user) router.replace("/dashboard");
      } catch {
        /* لا جلسة — البقاء في صفحة الدخول */
      } finally {
        if (active) setChecking(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  const strength = useMemo(() => password.length === 0, [password]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      await api.post("/api/auth/login", { username: identifier.trim(), password });
      setNotice("تم التحقق من الهوية — جارٍ تحميل لوحة التحكم...");
      router.push("/dashboard");
      router.refresh();
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : null;
      setError(apiError?.message ?? "تعذر تسجيل الدخول. حاول مرة أخرى.");
      if (apiError?.code === "LOCKED" || apiError?.status === 429) {
        setNotice("تم تقييد المحاولات لحماية الحسابات من هجمات القوة الغاشمة.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <main className="grid min-h-screen place-items-center px-6">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Spinner className="h-8 w-8" />
          <p className="text-xs">جارٍ التحقق من الجلسة...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* ------------------------- لوحة الهوية (يسار) ------------------------- */}
      <section className="relative hidden flex-col justify-between overflow-hidden border-l border-white/8 bg-abyss-900/50 p-10 lg:flex">
        {/* رادار متحرك */}
        <div className="pointer-events-none absolute -left-24 top-1/2 h-[520px] w-[520px] -translate-y-1/2 opacity-40">
          <div className="absolute inset-0 rounded-full border border-cyan-400/25" />
          <div className="absolute inset-12 rounded-full border border-cyan-400/20" />
          <div className="absolute inset-24 rounded-full border border-cyan-400/15" />
          <div className="absolute inset-36 rounded-full border border-cyan-400/10" />
          <div className="absolute inset-0 animate-spin-slow rounded-full border-t-2 border-cyan-400/60" style={{ animationDuration: "7s" }} />
          <div className="absolute inset-0 animate-scanline bg-gradient-to-b from-transparent via-cyan-400/8 to-transparent" />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <BrandMark className="h-12 w-12" />
            <div>
              <p className="text-2xl font-extrabold tracking-tight text-white">دِرْع</p>
              <p className="text-[11px] text-cyan-300/80">منصة الأمن السيبراني والإدارة الذكية</p>
            </div>
          </div>

          <h1 className="mt-12 max-w-md text-3xl font-extrabold leading-snug text-white">
            مركز عمليات أمني متكامل
            <span className="mt-2 block bg-gradient-to-l from-cyan-300 via-sky-300 to-violet-300 bg-clip-text text-lg font-semibold text-transparent">
              رصد حي • استجابة فورية • تدقيق كامل
            </span>
          </h1>

          <ul className="mt-10 space-y-4">
            {FEATURES.map((feature) => (
              <li key={feature.title} className="flex items-start gap-3">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-cyan-400/25 bg-cyan-400/8 text-cyan-300">
                  <Icon name={feature.icon} className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-bold text-white">{feature.title}</p>
                  <p className="mt-0.5 max-w-sm text-[11px] leading-relaxed text-slate-400">{feature.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative z-10 flex flex-wrap items-center gap-2">
          <Badge className="border-emerald-400/30 bg-emerald-400/10 text-emerald-200" dot>
            مراقبة على مدار الساعة
          </Badge>
          <Badge className="border-cyan-400/25 bg-cyan-400/8 text-cyan-200">تشفير bcrypt-12</Badge>
          <Badge className="border-violet-400/25 bg-violet-400/8 text-violet-200">أدوار صلاحيات دقيقة</Badge>
        </div>
      </section>

      {/* ------------------------------ نموذج الدخول ------------------------------ */}
      <section className="relative flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-7 flex items-center gap-3 lg:hidden">
            <BrandMark className="h-11 w-11" />
            <div>
              <p className="text-xl font-extrabold text-white">دِرْع</p>
              <p className="text-[10px] text-cyan-300/80">منصة الأمن السيبراني والإدارة الذكية</p>
            </div>
          </div>

          <div className="panel p-6 sm:p-7">
            <div className="mb-6">
              <p className="mono flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-cyan-300">
                <LiveDot tone="cyan" /> بوابة دخول آمنة
              </p>
              <h2 className="mt-2 text-xl font-extrabold text-white">تسجيل الدخول إلى المنصة</h2>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
                كل محاولة دخول تُسجَّل في سجل العمليات مع عنوان IP والتوقيت. يتم قفل الحساب مؤقتاً بعد 5 محاولات فاشلة.
              </p>
            </div>

            <form onSubmit={submit} className="space-y-4">
              <Field label="اسم المستخدم أو البريد الإلكتروني">
                <div className="relative">
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                    <Icon name="users" className="h-4 w-4" />
                  </span>
                  <input
                    className="field pr-10"
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    placeholder="admin"
                    autoComplete="username"
                    required
                    dir="ltr"
                    style={{ textAlign: "right" }}
                  />
                </div>
              </Field>

              <Field label="كلمة المرور" hint={capsLock ? "⚠ مفتاح Caps Lock مفعّل" : undefined}>
                <div className="relative">
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                    <Icon name="lock" className="h-4 w-4" />
                  </span>
                  <input
                    className="field pr-10 pl-11"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    onKeyUp={(event) => setCapsLock(event.getModifierState?.("CapsLock") ?? false)}
                    placeholder="••••••••••"
                    autoComplete="current-password"
                    required
                    dir="ltr"
                    style={{ textAlign: "right" }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((show) => !show)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-500 transition hover:bg-white/8 hover:text-cyan-300"
                    aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                  >
                    <Icon name="eye" className="h-4 w-4" />
                  </button>
                </div>
              </Field>

              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-3 text-[11px] leading-relaxed text-rose-200">
                  <Icon name="warning" className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              {notice && !error && (
                <div className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-3 text-[11px] leading-relaxed text-emerald-200">
                  <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{notice}</span>
                </div>
              )}

              <Button type="submit" variant="primary" className="w-full py-3 text-sm" loading={loading}>
                {loading ? "جارٍ التحقق الآمن..." : "دخول آمن"}
              </Button>
            </form>

            <div className="mt-6 rounded-xl border border-white/8 bg-white/3 p-3.5">
              <p className="mono mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">حسابات التجربة الجاهزة</p>
              <ul className="space-y-1.5">
                {DEMO_ACCOUNTS.map((account) => (
                  <li key={account.username}>
                    <button
                      type="button"
                      onClick={() => {
                        setIdentifier(account.username);
                        setPassword(account.password);
                        setError(null);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-lg border border-white/8 bg-abyss-850/70 px-2.5 py-1.5 text-[11px] transition hover:border-cyan-400/40",
                        identifier === account.username && "border-cyan-400/60 bg-cyan-400/8",
                      )}
                    >
                      <span className="font-bold text-slate-200">{account.role}</span>
                      <span className="mono text-slate-400" dir="ltr">
                        {account.username} / {account.password}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                اضغط على أي حساب لتعبئة البيانات تلقائياً. غيّر كلمة المرور من قائمة المستخدم بعد الدخول.
              </p>
            </div>
          </div>

          <p className="mono mt-5 text-center text-[10px] leading-relaxed text-slate-600">
            محمي بـ: SameSite=Strict • httpOnly Cookie • JWT HS256 • Rate Limiting • bcrypt
            {!strength ? "" : ""}
          </p>
        </div>
      </section>
    </main>
  );
}

const FEATURES = [
  {
    icon: "shield" as const,
    title: "مصادقة متعددة الطبقات",
    description: "تشفير bcrypt، قفل تلقائي للحسابات، حد معدل لكل IP وحساب، وجلسات JWT موقّعة تنتهي خلال 8 ساعات.",
  },
  {
    icon: "virus" as const,
    title: "فحص أمني ذكي للملفات",
    description: "كشف النوع الحقيقي بالبايتات السحرية، قواعد توقيع وسلوك، إنتروبيا، ثم تصنيف تلقائي وعزل الملفات المشبوهة.",
  },
  {
    icon: "activity" as const,
    title: "رسوم بيانية حية",
    description: "حركة الشبكة والتهديدات والطلبات المحظورة تتحدّث أمامك لحظياً مع تنبيهات فورية في الشريط العلوي.",
  },
  {
    icon: "audit" as const,
    title: "سجل تدقيق لا يُغفل شيئاً",
    description: "كل عملية — نجاحاً أو فشلاً أو حظراً — مسجّلة بالمستخدم وعنوان IP والوصف العربي، وقابلة للتصدير.",
  },
];

const DEMO_ACCOUNTS = [
  { role: "مدير النظام", username: "admin", password: "Admin@12345" },
  { role: "مشرف أمني", username: "supervisor", password: "Super@12345" },
  { role: "مستخدم", username: "user", password: "User@12345" },
];
