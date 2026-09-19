"use client";

/**
 * ============================================================================
 *  مكوّنات الواجهة الأساسية — موحّدة بين كل الصفحات
 * ============================================================================
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/format";
import { Icon, type IconName } from "@/components/icons";

/* --------------------------------- لوحة ---------------------------------- */

export function Panel({
  title,
  subtitle,
  icon,
  actions,
  className,
  bodyClassName,
  children,
}: {
  title?: string;
  subtitle?: string;
  icon?: IconName;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("panel panel-hover overflow-hidden", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/6 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2.5">
            {icon && (
              <span className="grid h-8 w-8 place-items-center rounded-lg border border-cyan-400/25 bg-cyan-400/10 text-cyan-300">
                <Icon name={icon} className="h-4 w-4" />
              </span>
            )}
            <div>
              <h2 className="panel-title">{title}</h2>
              {subtitle && <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn("p-4 sm:p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/* --------------------------------- شارة ---------------------------------- */

export function Badge({
  children,
  className,
  dot = false,
}: {
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span className={cn("chip border-white/10 bg-white/5 text-slate-300", className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse-dot" />}
      {children}
    </span>
  );
}

/* -------------------------------- أزرار ---------------------------------- */

type ButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger" | "soft";
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  type?: "button" | "submit";
  className?: string;
  title?: string;
};

export function Button({
  children,
  onClick,
  variant = "ghost",
  icon,
  disabled,
  loading,
  type = "button",
  className,
  title,
}: ButtonProps) {
  const styles = {
    primary: "btn-primary",
    ghost: "btn-ghost",
    danger: "btn-danger",
    soft: "btn-soft",
  }[variant];

  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(styles, "px-3.5 py-2 text-[13px]", className)}
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin-slow rounded-full border-2 border-current border-t-transparent" />
      ) : icon ? (
        <Icon name={icon} className="h-4 w-4" />
      ) : null}
      {children}
    </button>
  );
}

/* ------------------------------- حقول الإدخال ------------------------------ */

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 flex items-center justify-between text-xs font-medium text-slate-400">
        {label}
        {hint && <span className="text-[10px] text-slate-500">{hint}</span>}
      </span>
      {children}
      {error && <span className="mt-1 block text-[11px] text-rose-300">{error}</span>}
    </label>
  );
}

/* --------------------------------- نافذة --------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: IconName;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="absolute inset-0 animate-fade-in" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "panel animate-slide-up relative z-10 max-h-[92vh] w-full overflow-y-auto rounded-b-none sm:rounded-b-2xl",
          widths[size],
        )}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/8 bg-abyss-900/95 px-5 py-4 backdrop-blur">
          <div className="flex items-center gap-3">
            {icon && (
              <span className="grid h-9 w-9 place-items-center rounded-xl border border-cyan-400/25 bg-cyan-400/10 text-cyan-300">
                <Icon name={icon} className="h-4.5 w-4.5" />
              </span>
            )}
            <div>
              <h3 className="text-sm font-bold text-white">{title}</h3>
              {subtitle && <p className="mt-0.5 text-[11px] text-slate-400">{subtitle}</p>}
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/8 hover:text-white" aria-label="إغلاق">
            <Icon name="close" className="h-4 w-4" />
          </button>
        </header>
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <footer className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-white/8 bg-abyss-900/95 px-5 py-3 backdrop-blur">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ التنبيهات اللحظية --------------------------- */

type Toast = { id: number; type: "success" | "error" | "info"; message: string };
type ToastContextValue = { push: (type: Toast["type"], message: string) => void };

const ToastContext = createContext<ToastContextValue>({ push: () => undefined });

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((type: Toast["type"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, type, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 5200);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  const tones = {
    success: "border-emerald-400/35 bg-emerald-500/12 text-emerald-100",
    error: "border-rose-400/35 bg-rose-500/12 text-rose-100",
    info: "border-cyan-400/35 bg-cyan-500/12 text-cyan-100",
  };
  const icons: Record<Toast["type"], IconName> = { success: "check", error: "warning", info: "info" };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:left-6 sm:right-auto sm:items-start">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border px-3.5 py-3 text-xs shadow-2xl backdrop-blur-xl animate-slide-up",
              tones[toast.type],
            )}
            role="status"
          >
            <Icon name={icons[toast.type]} className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="leading-relaxed">{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ------------------------------ حالات فارغة/تحميل -------------------------- */

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return <span className={cn("block animate-spin-slow rounded-full border-2 border-cyan-300/40 border-t-cyan-300", className)} />;
}

export function LoadingBlock({ label = "جارٍ التحميل..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
      <Spinner className="h-7 w-7" />
      <p className="text-xs">{label}</p>
    </div>
  );
}

export function EmptyState({ icon = "info", title, hint }: { icon?: IconName; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl border border-white/8 bg-white/4 text-slate-400">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <p className="text-sm font-semibold text-slate-300">{title}</p>
      {hint && <p className="max-w-sm text-[11px] leading-relaxed text-slate-500">{hint}</p>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-rose-500/25 bg-rose-500/6 px-4 py-10 text-center">
      <Icon name="warning" className="h-6 w-6 text-rose-300" />
      <p className="max-w-md text-xs leading-relaxed text-rose-200">{message}</p>
      {onRetry && (
        <Button variant="ghost" icon="refresh" onClick={onRetry}>
          إعادة المحاولة
        </Button>
      )}
    </div>
  );
}

/* -------------------------------- شريط الخطورة ----------------------------- */

export function RiskBar({ value, className }: { value: number; className?: string }) {
  const tone = value >= 75 ? "from-rose-500 to-rose-400" : value >= 45 ? "from-amber-500 to-orange-400" : "from-emerald-500 to-teal-400";
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 w-full min-w-16 overflow-hidden rounded-full bg-white/8">
        <div className={cn("h-full rounded-full bg-gradient-to-l transition-all duration-700", tone)} style={{ width: `${Math.max(3, Math.min(100, value))}%` }} />
      </div>
      <span className="mono w-8 shrink-0 text-left text-slate-300">{value}</span>
    </div>
  );
}

/* --------------------------------- ترقيم ---------------------------------- */

export function Pagination({
  page,
  pages,
  total,
  onChange,
}: {
  page: number;
  pages: number;
  total: number;
  onChange: (page: number) => void;
}) {
  if (pages <= 1) return <p className="py-2 text-center text-[11px] text-slate-500">إجمالي النتائج: {total}</p>;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 text-[11px] text-slate-400">
      <span>
        صفحة {page} من {pages} — إجمالي {total} سجل
      </span>
      <div className="flex items-center gap-2">
        <Button variant="ghost" className="px-2.5 py-1.5" disabled={page <= 1} onClick={() => onChange(page - 1)} title="السابق">
          <Icon name="chevronLeft" className="h-4 w-4 rotate-180" />
        </Button>
        <Button variant="ghost" className="px-2.5 py-1.5" disabled={page >= pages} onClick={() => onChange(page + 1)} title="التالي">
          <Icon name="chevronLeft" className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------ مؤثر حي (نبض) ------------------------------ */

export function LiveDot({ tone = "emerald" }: { tone?: "emerald" | "rose" | "cyan" | "amber" }) {
  const tones = {
    emerald: "bg-emerald-400 shadow-[0_0_10px_2px_rgba(52,211,153,0.6)]",
    rose: "bg-rose-400 shadow-[0_0_10px_2px_rgba(251,113,133,0.6)]",
    cyan: "bg-cyan-400 shadow-[0_0_10px_2px_rgba(34,211,238,0.6)]",
    amber: "bg-amber-400 shadow-[0_0_10px_2px_rgba(251,191,36,0.6)]",
  };
  return <span className={cn("inline-block h-2 w-2 rounded-full animate-pulse-dot", tones[tone])} />;
}
