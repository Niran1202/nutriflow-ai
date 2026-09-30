import { prisma } from "@/lib/db";
import { apiUser, badRequest, generateInvitationCode, unauthorized } from "@/lib/auth";

/** Dietitian creates a patient with their plan; returns the invitation code. */
export async function POST(req: Request) {
  const me = await apiUser("DIETITIAN");
  if (!me) return unauthorized();

  const b = await req.json();
  const calorieTarget = Number(b.calorieTarget);
  const proteinTarget = Number(b.proteinTarget);
  const waterTarget = Number(b.waterTarget);
  if (!b.name?.trim()) return badRequest("Patient name is required");
  if (!b.goal?.trim()) return badRequest("Goal is required");
  if (!(calorieTarget > 0 && proteinTarget > 0 && waterTarget > 0)) {
    return badRequest("Calorie, protein and water targets must be positive numbers");
  }

  let invitationCode = generateInvitationCode();
  while (await prisma.dietitianPatient.findUnique({ where: { invitationCode } })) {
    invitationCode = generateInvitationCode();
  }

  const patient = await prisma.user.create({
    data: {
      name: b.name.trim(),
      role: "PATIENT",
      dietitianLink: { create: { dietitianId: me.id, invitationCode } },
      profile: {
        create: {
          goal: b.goal.trim(),
          dietType: b.dietType?.trim() || "No specific diet",
          preferences: b.preferences?.trim() || "None",
          restrictions: b.restrictions?.trim() || "None",
        },
      },
      target: { create: { calorieTarget, proteinTarget, waterTarget } },
    },
  });

  return Response.json({ id: patient.id, invitationCode });
}
