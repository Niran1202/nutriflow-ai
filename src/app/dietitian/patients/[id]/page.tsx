import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { dayString, weekdayShort } from "@/lib/dates";
import { adherencePercent, getRecentDays } from "@/lib/progress";
import { AppHeader, Badge, Stat } from "@/components/ui";
import { DailyBarChart } from "@/components/bar-chart";
import { AlertReview, PlanEditor, MessageBox, RunReviewButton } from "./patient-actions";

const AGENT_TONE: Record<string, string> = {
  Supervisor: "text-brand-strong",
  Dietitian: "text-warn",
};

export default async function PatientDetail({ params }: PageProps<"/dietitian/patients/[id]">) {
  const me = await requireRole("DIETITIAN");
  const { id } = await params;

  const link = await prisma.dietitianPatient.findUnique({
    where: { patientId: id },
    include: {
      patient: {
        include: {
          profile: true,
          target: true,
          alerts: { orderBy: { createdAt: "desc" }, take: 20 },
          agentEvents: { orderBy: { timestamp: "desc" }, take: 15 },
          meals: { orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 12 },
        },
      },
    },
  });
  if (!link || link.dietitianId !== me.id) notFound();
  const p = link.patient;
  const target = p.target!;
  const profile = p.profile!;

  const days = await getRecentDays(p.id);
  const adherence = link.joinedAt ? adherencePercent(days, target, dayString(link.joinedAt)) : null;
  const openAlerts = p.alerts.filter((a) => a.status === "OPEN");
  const reviewed = p.alerts.filter((a) => a.status === "REVIEWED");
  const plan = {
    goal: profile.goal,
    dietType: profile.dietType,
    preferences: profile.preferences,
    restrictions: profile.restrictions,
    calorieTarget: target.calorieTarget,
    proteinTarget: target.proteinTarget,
    waterTarget: target.waterTarget,
  };

  return (
    <>
      <AppHeader name={me.name} role="DIETITIAN" links={[{ href: "/dietitian", label: "Patients" }]} />
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <Link href="/dietitian" className="text-sm text-muted hover:text-ink">← Back to patients</Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{p.name}</h1>
            <p className="text-sm text-muted">
              {profile.goal} · {profile.dietType} · Prefers {profile.preferences} · Restrictions: {profile.restrictions}
            </p>
          </div>
          {link.joinedAt ? (
            <Badge tone="ok">Joined {link.joinedAt.toLocaleDateString("en-GB")}</Badge>
          ) : (
            <Badge tone="neutral">Invite pending · <span className="font-mono">{link.invitationCode}</span></Badge>
          )}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="7-day adherence" value={adherence === null ? "—" : `${adherence}%`} />
          <Stat label="Open alerts" value={openAlerts.length} tone={openAlerts.length ? "warn" : undefined} />
          <Stat label="Calories / day" value={<span className="text-2xl">{target.calorieTarget}</span>} />
          <Stat label="Protein / water" value={<span className="text-2xl">{target.proteinTarget} g · {target.waterTarget} L</span>} />
        </div>

        {/* Human-in-the-loop review queue */}
        <section id="alerts" className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Review queue</h2>
            <RunReviewButton patientId={p.id} />
          </div>
          {openAlerts.length === 0 ? (
            <div className="card mt-3 text-sm text-muted">No open alerts. The Monitoring Agent hasn&apos;t found a sustained deviation that needs your review.</div>
          ) : (
            <div className="mt-3 space-y-4">
              {openAlerts.map((a) => (
                <AlertReview
                  key={a.id}
                  patientId={p.id}
                  plan={plan}
                  alert={{
                    id: a.id,
                    type: a.type,
                    severity: a.severity,
                    reason: a.reason,
                    explanation: a.explanation,
                    evidence: JSON.parse(a.evidence),
                    createdAt: a.createdAt.toISOString(),
                  }}
                />
              ))}
            </div>
          )}
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="card">
            <h2 className="text-lg font-semibold">Last 7 days &amp; today</h2>
            <div className="mt-4 grid gap-6 md:grid-cols-3">
              <DailyBarChart title="Protein" unit="g" target={target.proteinTarget} points={days.map((d) => ({ date: d.date, value: d.protein }))} />
              <DailyBarChart title="Calories" unit="kcal" target={target.calorieTarget} points={days.map((d) => ({ date: d.date, value: d.calories }))} />
              <DailyBarChart title="Water" unit="L" decimals={1} target={target.waterTarget} points={days.map((d) => ({ date: d.date, value: d.water }))} />
            </div>
            <details className="mt-5">
              <summary className="cursor-pointer text-sm text-muted hover:text-ink">Show as table</summary>
              <table className="mt-3 w-full text-sm tabular-nums">
                <thead className="text-left text-muted">
                  <tr><th className="py-1 font-medium">Day</th><th className="font-medium">Meals</th><th className="font-medium">kcal</th><th className="font-medium">Protein</th><th className="font-medium">Water</th></tr>
                </thead>
                <tbody>
                  {days.map((d) => (
                    <tr key={d.date} className="border-t border-line">
                      <td className="py-1.5">{weekdayShort(d.date)} {d.date.slice(5)}</td>
                      <td>{d.mealCount}</td>
                      <td>{d.calories}</td>
                      <td>{d.protein} g</td>
                      <td>{d.water} L</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </div>

          <div className="space-y-6">
            <PlanEditor patientId={p.id} plan={plan} />
            <div className="card">
              <h2 className="font-semibold">Message patient</h2>
              <p className="mb-3 text-xs text-muted">Appears in the patient&apos;s assistant thread.</p>
              <MessageBox patientId={p.id} />
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="card">
            <h2 className="text-lg font-semibold">Recent meals</h2>
            {p.meals.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No meals logged yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line text-sm">
                {p.meals.map((m) => (
                  <li key={m.id} className="flex justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <div className="font-medium">{m.mealType} <span className="font-normal text-muted">· {weekdayShort(m.date)} {m.date.slice(5)}</span></div>
                      <div className="truncate text-muted">{m.food}</div>
                    </div>
                    <div className="shrink-0 text-right tabular-nums text-muted">{Math.round(m.calories)} kcal<br />{m.protein} g protein</div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <h2 className="text-lg font-semibold">Agent activity</h2>
            <p className="text-xs text-muted">Audit trail of what the AI did for this patient.</p>
            <ul className="mt-3 space-y-2 text-sm">
              {p.agentEvents.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span className="w-12 shrink-0 tabular-nums text-muted">{e.timestamp.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
                  <span><span className={`font-medium ${AGENT_TONE[e.agent] ?? ""}`}>{e.agent}</span> <span className="text-muted">{e.action.replace(/_/g, " ")}</span></span>
                </li>
              ))}
              {p.agentEvents.length === 0 && <li className="text-muted">No agent activity yet.</li>}
            </ul>
          </div>
        </section>

        {reviewed.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold">Review history</h2>
            <ul className="card mt-3 divide-y divide-line p-0 text-sm">
              {reviewed.map((a) => (
                <li key={a.id} className="flex flex-wrap justify-between gap-2 px-5 py-3">
                  <span>{a.reason}</span>
                  <span className="text-muted">
                    {({ KEEP_PLAN: "Kept current plan", MODIFY_PLAN: "Modified plan", MESSAGE_PATIENT: "Messaged patient" } as Record<string, string>)[a.decision ?? ""]}
                    {a.reviewedAt && ` · ${a.reviewedAt.toLocaleDateString("en-GB")}`}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
