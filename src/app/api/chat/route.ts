import { prisma } from "@/lib/db";
import { apiUser, badRequest, unauthorized } from "@/lib/auth";
import { runSupervisor } from "@/lib/agents/supervisor";

/** Patient → Supervisor → specialist agents → Coaching Agent → patient. */
export async function POST(req: Request) {
  const me = await apiUser("PATIENT");
  if (!me) return unauthorized();
  const { message } = await req.json();
  const text = String(message ?? "").trim();
  if (!text) return badRequest("Message is empty");
  if (text.length > 1000) return badRequest("Message is too long");

  // Run the agents first so the Patient Agent's "previous conversation" doesn't include this turn twice.
  const result = await runSupervisor({ patientId: me.id, trigger: "chat", message: text });
  const reply = result.reply ?? "Sorry, I couldn't put an answer together just now.";
  const meta = JSON.stringify({ intent: result.intent, usedLLM: result.usedLLM, trace: result.trace });

  await prisma.chatMessage.create({ data: { patientId: me.id, role: "patient", content: text } });
  const saved = await prisma.chatMessage.create({ data: { patientId: me.id, role: "assistant", content: reply, meta } });

  return Response.json({
    reply,
    id: saved.id,
    intent: result.intent,
    usedLLM: result.usedLLM,
    trace: result.trace,
    flagged: result.alertsCreated.length > 0,
  });
}
