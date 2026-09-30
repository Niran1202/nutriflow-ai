import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { AppHeader } from "@/components/ui";
import { NewPatientForm } from "./new-patient-form";

export default async function NewPatientPage() {
  const me = await requireRole("DIETITIAN");
  return (
    <>
      <AppHeader name={me.name} role="DIETITIAN" links={[{ href: "/dietitian", label: "Patients" }]} />
      <main className="mx-auto w-full max-w-2xl px-4 py-8">
        <Link href="/dietitian" className="text-sm text-muted hover:text-ink">← Back to patients</Link>
        <h1 className="mt-2 text-2xl font-semibold">Add a patient</h1>
        <p className="text-sm text-muted">Define their plan. NutriFlow generates an invitation code for them to join.</p>
        <NewPatientForm />
      </main>
    </>
  );
}
