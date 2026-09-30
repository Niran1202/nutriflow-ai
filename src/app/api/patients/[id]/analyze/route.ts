import { apiUser, assertOwnsPatient, unauthorized } from "@/lib/auth";
import { runSupervisor } from "@/lib/agents/supervisor";

/** Dietitian asks the agents to re-run a full review of this patient now. */
export async function POST(_req: Request, ctx: RouteContext<"/api/patients/[id]/analyze">) {
  const me = await apiUser("DIETITIAN");
  if (!me) return unauthorized();
  const { id } = await ctx.params;
  try {
    await assertOwnsPatient(me.id, id);
  } catch {
    return unauthorized();
  }
  const result = await runSupervisor({ patientId: id, trigger: "review" });
  return Response.json({ alertsCreated: result.alertsCreated.length, trace: result.trace });
}
