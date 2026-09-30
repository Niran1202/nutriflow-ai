import { prisma } from "@/lib/db";
import { apiUser, assertOwnsPatient, badRequest, unauthorized } from "@/lib/auth";

/** Dietitian sends a message; it appears in the patient's assistant thread. */
export async function POST(req: Request, ctx: RouteContext<"/api/patients/[id]/messages">) {
  const me = await apiUser("DIETITIAN");
  if (!me) return unauthorized();
  const { id } = await ctx.params;
  try {
    await assertOwnsPatient(me.id, id);
  } catch {
    return unauthorized();
  }
  const { content } = await req.json();
  if (!content?.trim()) return badRequest("Message is empty");
  await prisma.chatMessage.create({ data: { patientId: id, role: "dietitian", content: content.trim() } });
  return Response.json({ ok: true });
}
