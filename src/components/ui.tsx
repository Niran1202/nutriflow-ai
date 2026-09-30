import Link from "next/link";
import type { ReactNode } from "react";
import { LogoutButton } from "./logout-button";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
        <circle cx="12" cy="12" r="11" fill="var(--color-brand)" />
        <path d="M7 14c2.5-6 7-7 10-7-1 4-3 9-9 9" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      NutriFlow AI
    </span>
  );
}

export function AppHeader({ name, role, links }: { name: string; role: string; links?: { href: string; label: string }[] }) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href={role === "DIETITIAN" ? "/dietitian" : "/patient"}>
            <Logo />
          </Link>
          <nav className="hidden gap-4 text-sm text-muted sm:flex">
            {links?.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-ink">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden text-muted sm:inline">
            {name} · {role === "DIETITIAN" ? "Dietitian" : "Patient"}
          </span>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}

export function ProgressBar({ label, value, target, unit, decimals = 0 }: { label: string; value: number; target: number; unit: string; decimals?: number }) {
  const pct = target > 0 ? Math.min((value / target) * 100, 100) : 0;
  const over = value > target * 1.1;
  const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm tabular-nums text-muted">
          <span className="font-semibold text-ink">{fmt(value)}</span> / {fmt(target)} {unit}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-canvas" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={`h-full rounded-full ${over ? "bg-warn" : "bg-brand"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const BADGE = {
  ok: "bg-brand-soft text-brand-strong",
  warning: "bg-warn-soft text-warn",
  high: "bg-danger-soft text-danger",
  info: "bg-canvas text-muted",
  neutral: "bg-canvas text-muted",
} as const;

export function Badge({ tone, children }: { tone: keyof typeof BADGE; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE[tone]}`}>{children}</span>;
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "warn" }) {
  return (
    <div className="card py-4">
      <div className="eyebrow">{label}</div>
      <div className={`mt-1 text-3xl font-semibold tabular-nums ${tone === "warn" ? "text-warn" : ""}`}>{value}</div>
    </div>
  );
}
