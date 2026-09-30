import { prisma } from "@/lib/db";
import { apiUser, assertOwnsPatient, badRequest, unauthorized } from "@/lib/auth";
import { logAgentEvent } from "@/lib/agents/events";

const DECISIONS = ["KEEP_PLAN", "MODIFY_PLAN", "MESSAGE_PATIENT"] as const;

/** Human-in-the-loop: the dietitian records a decision on an AI alert. */
export async function POST(req: Request, ctx: RouteContext<"/api/alerts/[id]/review">) {
  const me = await apiUser("DIETITIAN");
  if (!me) return unauthorized();
  const { id } = await ctx.params;

  const alert = await prisma.alert.findUnique({ where: { id } });
  if (!alert) return Response.json({ error: "Alert not found" }, { status: 404 });
  try {
    await assertOwnsPatient(me.id, alert.patientId);
  } catch {
    return unauthorized();
  }

  const { decision, note } = await req.json();
  if (!DECISIONS.includes(decision)) return badRequest("Unknown decision");

  await prisma.alert.update({
    where: { id },
    data: { status: "REVIEWED", decision, decisionNote: note?.trim() || null, reviewedAt: new Date() },
  });
  await logAgentEvent(alert.patientId, "Dietitian", "alert_reviewed", { alert: alert.type, decision, by: me.name });
  return Response.json({ ok: true });
}
