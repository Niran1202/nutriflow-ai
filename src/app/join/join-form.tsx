"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { FormError } from "@/components/auth-shell";

/** Step 1: enter the invitation code. */
export function JoinCodeForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const normalized = code.trim().toUpperCase();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/auth/join?code=${encodeURIComponent(normalized)}`, "GET");
      router.push(`/join?code=${encodeURIComponent(normalized)}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="flex gap-2">
        <input
          aria-label="Invitation code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="NF-8K29-XP"
          required
          className="input font-mono uppercase tracking-wider"
        />
        <button className="btn-primary shrink-0" disabled={busy}>{busy ? "Checking…" : "Join"}</button>
      </div>
      <FormError message={error} />
    </form>
  );
}

/** Step 2: the invited patient sets their own login. */
export function JoinAccountForm({ code }: { code: string }) {
  const router = useRouter();
  const [invite, setInvite] = useState<{ name: string; dietitian: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ name: string; dietitian: string }>(`/api/auth/join?code=${encodeURIComponent(code)}`, "GET")
      .then(setInvite)
      .catch((err) => setError(err.message));
  }, [code]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (form.get("password") !== form.get("confirm")) {
      setError("Passwords don't match");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { redirect } = await api<{ redirect: string }>("/api/auth/join", "POST", {
        code,
        email: form.get("email"),
        password: form.get("password"),
      });
      router.push(redirect);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (!invite) {
    return error ? (
      <div className="space-y-4">
        <FormError message={error} />
        <JoinCodeForm />
      </div>
    ) : (
      <p className="text-sm text-muted">Checking invitation…</p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="rounded-lg bg-brand-soft px-3 py-2 text-sm">
        Welcome, <strong>{invite.name}</strong>. You&apos;re joining <strong>{invite.dietitian}</strong>&apos;s practice
        <span className="ml-1 font-mono text-xs">({code})</span>.
      </div>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required className="input" autoComplete="email" />
      </div>
      <div>
        <label className="label" htmlFor="password">Choose a password</label>
        <input id="password" name="password" type="password" minLength={8} required className="input" autoComplete="new-password" />
      </div>
      <div>
        <label className="label" htmlFor="confirm">Confirm password</label>
        <input id="confirm" name="confirm" type="password" minLength={8} required className="input" autoComplete="new-password" />
      </div>
      <FormError message={error} />
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Joining…" : "Join NutriFlow"}</button>
    </form>
  );
}
