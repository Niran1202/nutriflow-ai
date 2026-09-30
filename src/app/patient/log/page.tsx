import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { AppHeader } from "@/components/ui";
import { MealForm } from "./meal-form";

export default async function LogMealPage() {
  const me = await requireRole("PATIENT");
  return (
    <>
      <AppHeader name={me.name} role="PATIENT" />
      <main className="mx-auto w-full max-w-2xl px-4 py-8">
        <Link href="/patient" className="text-sm text-muted hover:text-ink">← Back to today</Link>
        <h1 className="mt-2 text-2xl font-semibold">Log a meal</h1>
        <p className="text-sm text-muted">Pick foods and amounts, or enter the values yourself.</p>
        <MealForm />
      </main>
    </>
  );
}
