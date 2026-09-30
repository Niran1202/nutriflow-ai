import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Logo } from "@/components/ui";
import { JoinCodeForm } from "./join/join-form";

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "DIETITIAN" ? "/dietitian" : "/patient");

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-10">
      <Logo className="text-lg" />
      <section className="mt-12 max-w-2xl">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Nutrition coaching your dietitian stays in charge of.</h1>
        <p className="mt-4 text-lg text-muted">
          Local AI agents watch food logs and progress, give plan-aligned coaching, and flag patterns for the dietitian to review. The AI never changes the plan.
        </p>
      </section>

      <section className="mt-12 grid gap-6 md:grid-cols-2">
        <div className="card">
          <div className="eyebrow">For patients</div>
          <h2 className="mt-1 text-xl font-semibold">Patient login</h2>
          <p className="mt-2 text-sm text-muted">Already joined? Log in to see today&apos;s goals and log meals.</p>
          <Link href="/login" className="btn-primary mt-4">Log in</Link>
          <hr className="my-6 border-line" />
          <h3 className="font-medium">Don&apos;t have access?</h3>
          <p className="mb-3 mt-1 text-sm text-muted">Enter the invitation code your dietitian gave you.</p>
          <JoinCodeForm />
        </div>

        <div className="card">
          <div className="eyebrow">For dietitians</div>
          <h2 className="mt-1 text-xl font-semibold">Manage your patients</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>• Create patients and set their nutrition targets</li>
            <li>• Invite them with a one-time code</li>
            <li>• Review AI-flagged patterns — you make every plan decision</li>
          </ul>
          <p className="mt-4 text-sm text-muted">Dietitian accounts are issued by NutriFlow — log in with the details you were given.</p>
          <div className="mt-4 flex gap-3">
            <Link href="/login" className="btn-primary">Dietitian log in</Link>
          </div>
        </div>
      </section>

      <p className="mt-auto pt-12 text-xs text-muted">Private AI: patient data and the AI model stay on the NutriFlow server — nothing is sent to cloud AI services.</p>
    </main>
  );
}
