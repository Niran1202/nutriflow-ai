import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "DIETITIAN" ? "/dietitian" : "/patient");
  return (
    <AuthShell
      title="Log in"
      subtitle="Dietitians and patients use the same login."
      footer={
        <>
          New patient? <Link href="/join" className="text-brand hover:underline">Join with an invitation code</Link>
          <br />
          Dietitians log in with the account provided by NutriFlow.
        </>
      }
    >
      <LoginForm />
    </AuthShell>
  );
}
