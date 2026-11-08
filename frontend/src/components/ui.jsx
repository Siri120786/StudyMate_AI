import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { tr } from "../lib/i18n";

export function Icon({ name, fill = false, className = "", size }) {
  return (
    <span aria-hidden="true" className={`material-symbols-outlined ${fill ? "fill" : ""} ${className}`} style={size ? { fontSize: size } : undefined}>
      {name}
    </span>
  );
}

export function Logo({ to = "/", className = "" }) {
  return (
    <Link to={to} className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap ${className}`}>
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-high text-cyan">
        <Icon name="auto_awesome" fill size={20} />
      </span>
      <span className="font-display text-[1.35rem] font-bold tracking-tight">
        StudyMate <span className="text-primary">{tr("AI")}</span>
      </span>
    </Link>
  );
}

const BUTTON = {
  primary: "bg-brand text-white hover:bg-brand-strong shadow-[0_0_0_0_transparent] hover:shadow-[0_0_24px_-4px_rgb(108_92_231/0.7)]",
  soft: "bg-primary/20 text-primary hover:bg-primary/30",
  ghost: "border border-line text-ink hover:bg-high",
  plain: "text-mute hover:text-ink hover:bg-high",
  danger: "bg-coral-bg text-coral hover:brightness-110",
  white: "bg-white text-brand-strong hover:bg-white/90",
};
const SIZE = { sm: "px-4 py-1.5 text-sm", md: "px-6 py-2.5 text-[15px]", lg: "px-8 py-3.5 text-base" };

export function Button({ variant = "primary", size = "md", icon, trailing, as: As = "button", className = "", children, ...rest }) {
  const props = As === "button" ? { type: "button", ...rest } : rest;
  return (
    <As
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold transition duration-200 active:scale-[0.98] hover:scale-[1.02] disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap ${BUTTON[variant]} ${SIZE[size]} ${className}`}
    >
      {icon && <Icon name={icon} size={18} />}
      {children}
      {trailing && <Icon name={trailing} size={18} />}
    </As>
  );
}

export function Pill({ tone = "mute", icon, children, className = "" }) {
  const tones = {
    mute: "bg-high text-mute",
    primary: "bg-primary/15 text-primary",
    cyan: "bg-cyan/15 text-cyan",
    amber: "bg-amber/15 text-amber",
    coral: "bg-coral/15 text-coral",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-xs font-semibold ${tones[tone]} ${className}`}>
      {icon && <Icon name={icon} size={14} />}
      {children}
    </span>
  );
}

export function Card({ className = "", children, ...rest }) {
  return (
    <div className={`rounded-2xl border border-line/40 bg-low ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function Skeleton({ className = "" }) {
  return <div className={`skeleton ${className}`} />;
}

export function ProgressBar({ value, tone = "cyan", className = "" }) {
  const color = { cyan: "bg-teal", primary: "bg-brand", amber: "bg-amber", coral: "bg-coral" }[tone];
  return (
    <div className={`h-2 overflow-hidden rounded-full bg-high ${className}`} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Ring({ value, size = 56, stroke = 5, color = "var(--cyan)", children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeOpacity="0.2" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(100, value)) / 100)}
          style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

export function EmptyState({ icon, title, body, action }) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-line/60 px-6 py-14 text-center">
      <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-high text-primary"><Icon name={icon} size={28} /></span>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-mute">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide = false }) {
  const ref = useRef();
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div ref={ref} tabIndex={-1} className={`pop relative max-h-[90dvh] w-full overflow-y-auto rounded-2xl border border-line/50 bg-card p-6 shadow-2xl outline-none ${wide ? "max-w-2xl" : "max-w-lg"}`}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button onClick={onClose} aria-label={tr("Close")} className="rounded-full p-1 text-mute hover:bg-high hover:text-ink"><Icon name="close" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, hint, error, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-faint">{hint}</span>}
      {error && <span className="mt-1 block text-sm text-coral">{error}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-line bg-low px-4 py-3 text-ink placeholder:text-faint outline-none transition focus:border-brand focus:shadow-[0_0_0_3px_rgb(108_92_231/0.25)]";

const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, tone = "default") => {
    const id = crypto.randomUUID();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-24 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2 md:bottom-8" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`pop pointer-events-auto flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-medium shadow-xl ${t.tone === "error" ? "border-coral/40 bg-card text-coral" : "border-line/50 bg-card text-ink"}`}>
            <Icon name={t.tone === "error" ? "error" : "check_circle"} size={18} className={t.tone === "error" ? "" : "text-cyan"} />
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
