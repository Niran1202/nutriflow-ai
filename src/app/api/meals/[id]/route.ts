import { prisma } from "@/lib/db";
import { apiUser, unauthorized } from "@/lib/auth";
import { recomputeDailyProgress } from "@/lib/progress";

export async function DELETE(_req: Request, ctx: RouteContext<"/api/meals/[id]">) {
  const me = await apiUser("PATIENT");
  if (!me) return unauthorized();
  const { id } = await ctx.params;
  const meal = await prisma.meal.findUnique({ where: { id } });
  if (!meal || meal.patientId !== me.id) return Response.json({ error: "Not found" }, { status: 404 });
  await prisma.meal.delete({ where: { id } });
  await recomputeDailyProgress(me.id, meal.date);
  return Response.json({ ok: true });
}
