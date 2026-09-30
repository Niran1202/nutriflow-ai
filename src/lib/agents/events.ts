import { prisma } from "../db";

/** Audit trail: every agent action is stored so the dietitian can see what the AI did. */
export async function logAgentEvent(patientId: string, agent: string, action: string, result: unknown) {
  await prisma.agentEvent.create({
    data: { patientId, agent, action, result: JSON.stringify(result) },
  });
}
