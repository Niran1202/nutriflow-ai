"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client";
import { FormError } from "@/components/auth-shell";
import { PlanFields } from "@/components/plan-fields";

export function NewPatientForm() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ id: string; invitationCode: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ id: string; invitationCode: string }>("/api/patients", "POST", form);
      setCreated({ ...res, name: String(form.name) });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <div className="card mt-6 text-center">
        <div className="eyebrow">Patient invitation code</div>
        <div className="mt-3 font-mono text-4xl font-semibold tracking-widest text-brand">{created.invitationCode}</div>
        <p className="mx-auto mt-3 max-w-sm text-sm text-muted">
          Give this code to <strong className="text-ink">{created.name}</strong>. They enter it on the NutriFlow start page to join. It works once.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <button
            className="btn-secondary"
            onClick={async () => {
              await navigator.clipboard.writeText(created.invitationCode);
              setCopied(true);
            }}
          >
            {copied ? "Copied ✓" : "Copy code"}
          </button>
          <Link href={`/dietitian/patients/${created.id}`} className="btn-secondary">View patient</Link>
          <Link href="/dietitian" className="btn-primary">Back to dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card mt-6 space-y-5">
      <div>
        <label className="label" htmlFor="name">Patient name</label>
        <input id="name" name="name" required className="input" placeholder="Max Weber" />
      </div>
      <PlanFields />
      <FormError message={error} />
      <div className="flex justify-end">
        <button className="btn-primary" disabled={busy}>{busy ? "Creating…" : "Create patient & invitation"}</button>
      </div>
    </form>
  );
}
