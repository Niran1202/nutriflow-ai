import { prisma } from "@/lib/db";
import { apiUser, assertOwnsPatient, badRequest, unauthorized } from "@/lib/auth";
import { logAgentEvent } from "@/lib/agents/events";

/** Only the owning dietitian can change a patient's plan. The AI never calls this. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/patients/[id]/plan">) {
  const me = await apiUser("DIETITIAN");
  if (!me) return unauthorized();
  const { id } = await ctx.params;
  try {
    await assertOwnsPatient(me.id, id);
  } catch {
    return unauthorized();
  }

  const b = await req.json();
  const calorieTarget = Number(b.calorieTarget);
  const proteinTarget = Number(b.proteinTarget);
  const waterTarget = Number(b.waterTarget);
  if (!(calorieTarget > 0 && proteinTarget > 0 && waterTarget > 0)) {
    return badRequest("Targets must be positive numbers");
  }

  await prisma.$transaction([
    prisma.nutritionTarget.update({ where: { patientId: id }, data: { calorieTarget, proteinTarget, waterTarget } }),
    prisma.patientProfile.update({
      where: { patientId: id },
      data: {
        goal: b.goal?.trim() || undefined,
        dietType: b.dietType?.trim() || undefined,
        preferences: b.preferences?.trim() || undefined,
        restrictions: b.restrictions?.trim() || undefined,
      },
    }),
  ]);
  await logAgentEvent(id, "Dietitian", "plan_updated", { by: me.name, calorieTarget, proteinTarget, waterTarget });
  return Response.json({ ok: true });
}
