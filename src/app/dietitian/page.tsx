import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { dayString } from "@/lib/dates";
import { adherencePercent, getRecentDays } from "@/lib/progress";
import { AppHeader, Badge, Stat } from "@/components/ui";

export default async function DietitianDashboard() {
  const me = await requireRole("DIETITIAN");

  const links = await prisma.dietitianPatient.findMany({
    where: { dietitianId: me.id },
    include: {
      patient: {
        include: {
          target: true,
          profile: true,
          alerts: { where: { status: "OPEN" }, orderBy: { createdAt: "desc" } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const patients = await Promise.all(
    links.map(async (l) => {
      const p = l.patient;
      const days = await getRecentDays(p.id);
      const adherence = l.joinedAt && p.target ? adherencePercent(days, p.target, dayString(l.joinedAt)) : null;
      return { link: l, patient: p, adherence, openAlerts: p.alerts };
    }),
  );
  // Patients needing review first.
  patients.sort((a, b) => b.openAlerts.length - a.openAlerts.length);
  const needsReview = patients.filter((p) => p.openAlerts.length > 0).length;

  return (
    <>
      <AppHeader name={me.name} role="DIETITIAN" links={[{ href: "/dietitian", label: "Patients" }]} />
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Your patients</h1>
            <p className="text-sm text-muted">AI agents monitor food logs and flag patterns. You make every plan decision.</p>
          </div>
          <Link href="/dietitian/patients/new" className="btn-primary">+ Add patient</Link>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:max-w-md">
          <Stat label="Patients" value={patients.length} />
          <Stat label="Needs review" value={needsReview} tone={needsReview ? "warn" : undefined} />
        </div>

        {patients.length === 0 ? (
          <div className="card mt-6 text-center">
            <p className="font-medium">No patients yet</p>
            <p className="mt-1 text-sm text-muted">Add a patient, set their targets, and share their invitation code.</p>
          </div>
        ) : (
          <ul className="mt-6 grid gap-3">
            {patients.map(({ link, patient, adherence, openAlerts }) => (
              <li key={patient.id}>
                <Link href={`/dietitian/patients/${patient.id}`} className="card flex flex-wrap items-center justify-between gap-4 transition-colors hover:border-brand/40">
                  <div className="min-w-0">
                    <div className="font-semibold">{patient.name}</div>
                    <div className="mt-0.5 text-sm text-muted">
                      {patient.profile?.goal} · {patient.profile?.dietType}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    {!link.joinedAt ? (
                      <Badge tone="neutral">Invite pending · <span className="font-mono">{link.invitationCode}</span></Badge>
                    ) : (
                      <>
                        <div className="text-right">
                          <div className="eyebrow">Adherence</div>
                          <div className="text-lg font-semibold tabular-nums">{adherence === null ? "—" : `${adherence}%`}</div>
                        </div>
                        {openAlerts.length ? (
                          <Badge tone={openAlerts.some((a) => a.severity === "high") ? "high" : "warning"}>
                            ⚠ {openAlerts[0].reason.replace(/ for \d+ consecutive days\.$/, "").replace(/\.$/, "")}
                            {openAlerts.length > 1 && ` +${openAlerts.length - 1}`}
                          </Badge>
                        ) : (
                          <Badge tone="ok">✓ Stable</Badge>
                        )}
                      </>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
