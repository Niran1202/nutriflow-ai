"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { FormError } from "@/components/auth-shell";
import { PlanFields, type PlanValues } from "@/components/plan-fields";
import { Badge } from "@/components/ui";

type AlertView = {
  id: string;
  type: string;
  severity: string;
  reason: string;
  explanation: string;
  evidence: {
    unit?: string;
    target?: number;
    average?: number;
    deviationPercent?: number;
    consecutiveDays?: number;
    days?: { day: string; value: number }[];
    message?: string;
  };
  createdAt: string;
};

function planPayload(form: HTMLFormElement) {
  return Object.fromEntries(new FormData(form));
}

export function AlertReview({ alert, patientId, plan }: { alert: AlertView; patientId: string; plan: PlanValues }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "modify" | "message">("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const e = alert.evidence;

  async function decide(decision: string, before?: () => Promise<unknown>, note?: string) {
    setBusy(true);
    setError(null);
    try {
      if (before) await before();
      await api(`/api/alerts/${alert.id}/review`, "POST", { decision, note });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const tone = alert.severity === "high" ? "high" : alert.severity === "warning" ? "warning" : "info";

  return (
    <article className={`card border-l-4 ${tone === "high" ? "border-l-danger" : tone === "warning" ? "border-l-warn" : "border-l-muted"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge tone={tone}>⚠ Review recommended</Badge>
        <span className="text-xs text-muted">{new Date(alert.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>
      </div>

      <h3 className="mt-3 font-semibold">{alert.reason}</h3>
      <p className="mt-1 text-sm text-muted">{alert.explanation}</p>

      {e.average !== undefined && (
        <dl className="mt-4 grid grid-cols-3 gap-3 rounded-lg bg-canvas p-3 text-sm">
          <div><dt className="eyebrow">Average</dt><dd className="font-semibold tabular-nums">{e.average} {e.unit}/day</dd></div>
          <div><dt className="eyebrow">Target</dt><dd className="font-semibold tabular-nums">{e.target} {e.unit}/day</dd></div>
          <div><dt className="eyebrow">Deviation</dt><dd className="font-semibold tabular-nums">{e.deviationPercent! > 0 ? "+" : ""}{e.deviationPercent}%</dd></div>
          {e.days && (
            <div className="col-span-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted tabular-nums">
              {e.days.map((d, i) => <span key={i}>{d.day} <strong className="text-ink">{d.value}</strong></span>)}
            </div>
          )}
        </dl>
      )}

      <p className="mt-3 text-xs font-medium text-brand-strong">✓ AI did not modify the patient&apos;s plan.</p>

      {mode === "idle" && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn-secondary" disabled={busy} onClick={() => decide("KEEP_PLAN")}>Keep current plan</button>
          <button className="btn-secondary" disabled={busy} onClick={() => setMode("modify")}>Modify plan</button>
          <button className="btn-primary" disabled={busy} onClick={() => setMode("message")}>Message patient</button>
        </div>
      )}

      {mode === "modify" && (
        <form
          className="mt-4 space-y-4 border-t border-line pt-4"
          onSubmit={(ev) => {
            ev.preventDefault();
            const body = planPayload(ev.currentTarget);
            decide("MODIFY_PLAN", () => api(`/api/patients/${patientId}/plan`, "PATCH", body), "Plan updated from alert review");
          }}
        >
          <PlanFields defaults={plan} />
          <div className="flex gap-2">
            <button className="btn-primary" disabled={busy}>Save new plan</button>
            <button type="button" className="btn-secondary" onClick={() => setMode("idle")}>Cancel</button>
          </div>
        </form>
      )}

      {mode === "message" && (
        <form
          className="mt-4 space-y-3 border-t border-line pt-4"
          onSubmit={(ev) => {
            ev.preventDefault();
            const content = String(new FormData(ev.currentTarget).get("content"));
            decide("MESSAGE_PATIENT", () => api(`/api/patients/${patientId}/messages`, "POST", { content }), content);
          }}
        >
          <label className="label" htmlFor={`msg-${alert.id}`}>Message to patient</label>
          <textarea id={`msg-${alert.id}`} name="content" rows={3} required className="input" defaultValue={suggestedMessage(alert)} />
          <div className="flex gap-2">
            <button className="btn-primary" disabled={busy}>Send & mark reviewed</button>
            <button type="button" className="btn-secondary" onClick={() => setMode("idle")}>Cancel</button>
          </div>
        </form>
      )}
      <div className="mt-3"><FormError message={error} /></div>
    </article>
  );
}

function suggestedMessage(a: AlertView) {
  if (a.type === "PROTEIN_LOW") return `Hi! I noticed your protein has been under your ${a.evidence.target} g target this week. Let's aim to add one protein-rich food to each main meal — the AI assistant can suggest options that fit your plan.`;
  if (a.type === "WATER_LOW") return "Hi! Your water intake has been a bit low lately. Try keeping a bottle nearby and logging each refill.";
  if (a.type === "LOGGING_GAP") return "Hi! I haven't seen any meals logged for a few days — is everything okay? Even rough entries help me support you.";
  return "Hi! I've reviewed your recent logs — ";
}

export function PlanEditor({ patientId, plan }: { patientId: string; plan: PlanValues }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!editing) {
    return (
      <div className="card">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Nutrition plan</h2>
          <button className="text-sm text-brand hover:underline" onClick={() => setEditing(true)}>Edit</button>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-muted">Calories</dt><dd className="text-right tabular-nums">{plan.calorieTarget} kcal</dd>
          <dt className="text-muted">Protein</dt><dd className="text-right tabular-nums">{plan.proteinTarget} g</dd>
          <dt className="text-muted">Water</dt><dd className="text-right tabular-nums">{plan.waterTarget} L</dd>
          <dt className="text-muted">Diet</dt><dd className="text-right">{plan.dietType}</dd>
        </dl>
        <p className="mt-3 text-xs text-muted">Only you can change this plan.</p>
      </div>
    );
  }

  return (
    <form
      className="card space-y-4"
      onSubmit={async (ev) => {
        ev.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api(`/api/patients/${patientId}/plan`, "PATCH", planPayload(ev.currentTarget));
          setEditing(false);
          router.refresh();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="font-semibold">Edit plan</h2>
      <PlanFields defaults={plan} />
      <FormError message={error} />
      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy}>Save</button>
        <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
      </div>
    </form>
  );
}

export function MessageBox({ patientId }: { patientId: string }) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  return (
    <form
      className="space-y-2"
      onSubmit={async (ev) => {
        ev.preventDefault();
        try {
          await api(`/api/patients/${patientId}/messages`, "POST", { content: text });
          setText("");
          setStatus("Sent ✓");
        } catch (err) {
          setStatus((err as Error).message);
        }
      }}
    >
      <textarea aria-label="Message" rows={3} className="input" value={text} onChange={(e) => { setText(e.target.value); setStatus(null); }} required />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">{status}</span>
        <button className="btn-primary" disabled={!text.trim()}>Send</button>
      </div>
    </form>
  );
}

export function RunReviewButton({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      {result && <span className="text-xs text-muted">{result}</span>}
      <button
        className="btn-secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await api<{ alertsCreated: number }>(`/api/patients/${patientId}/analyze`, "POST");
            setResult(r.alertsCreated ? `${r.alertsCreated} new alert(s)` : "No new findings");
            router.refresh();
          } catch (err) {
            setResult((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Agents running…" : "Run agent review now"}
      </button>
    </div>
  );
}
