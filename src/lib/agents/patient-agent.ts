import { prisma } from "../db";
import { dayString } from "../dates";
import type { PatientContext } from "./types";

/**
 * Patient Agent — retrieves who the patient is and what their dietitian
 * prescribed. Pure retrieval: it never interprets or changes the plan.
 */
export async function runPatientAgent(patientId: string): Promise<PatientContext> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: patientId },
    include: {
      profile: true,
      target: true,
      dietitianLink: true,
      chatMessages: { orderBy: { createdAt: "desc" }, take: 6 },
    },
  });
  if (!user.profile || !user.target) {
    throw new Error("Patient has no dietitian-defined plan yet");
  }
  return {
    patientId,
    name: user.name,
    firstName: user.name.split(" ")[0],
    goal: user.profile.goal,
    dietType: user.profile.dietType,
    preferences: user.profile.preferences,
    restrictions: user.profile.restrictions,
    targets: {
      calorieTarget: user.target.calorieTarget,
      proteinTarget: user.target.proteinTarget,
      waterTarget: user.target.waterTarget,
    },
    joinedDay: user.dietitianLink?.joinedAt ? dayString(user.dietitianLink.joinedAt) : null,
    recentConversation: user.chatMessages
      .reverse()
      .map((m) => ({ role: m.role, content: m.content })),
  };
}
