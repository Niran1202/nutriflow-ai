import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { JoinCodeForm, JoinAccountForm } from "./join-form";

export default async function JoinPage({ searchParams }: PageProps<"/join">) {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "DIETITIAN" ? "/dietitian" : "/patient");
  const { code } = await searchParams;
  const initial = typeof code === "string" ? code : "";

  return (
    <AuthShell
      title="Join your dietitian"
      subtitle="Your dietitian set up your plan. Use the invitation code they gave you."
      footer={<>Already joined? <Link href="/login" className="text-brand hover:underline">Log in</Link></>}
    >
      {initial ? <JoinAccountForm code={initial} /> : <JoinCodeForm />}
    </AuthShell>
  );
}
