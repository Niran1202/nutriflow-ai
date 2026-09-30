import { prisma } from "@/lib/db";
import { badRequest, createSession, hashPassword } from "@/lib/auth";
import { clientIp, rateLimited, tooManyAttempts } from "@/lib/rate-limit";

// Invitation codes are short, so guessing them from the internet must be slowed down.
const checkLimit = (req: Request) => tooManyAttempts(`join-ip:${clientIp(req)}`, 20);

/** GET ?code=... — check an invitation code and return the invited patient's name. */
export async function GET(req: Request) {
  const wait = checkLimit(req);
  if (wait) return rateLimited(wait);
  const code = new URL(req.url).searchParams.get("code")?.trim().toUpperCase();
  if (!code) return badRequest("Invitation code is required");
  const link = await prisma.dietitianPatient.findUnique({
    where: { invitationCode: code },
    include: { patient: true, dietitian: true },
  });
  if (!link) return Response.json({ error: "Invitation code not found" }, { status: 404 });
  if (link.joinedAt) return badRequest("This invitation has already been used. Please log in instead.");
  return Response.json({ name: link.patient.name, dietitian: link.dietitian.name });
}

/** POST — claim the invitation: the patient sets their own email and password. */
export async function POST(req: Request) {
  const wait = checkLimit(req);
  if (wait) return rateLimited(wait);
  const { code, email, password } = await req.json();
  if (!code || !email || !password) return badRequest("Code, email and password are required");
  if (password.length < 8) return badRequest("Password must be at least 8 characters");

  const link = await prisma.dietitianPatient.findUnique({
    where: { invitationCode: String(code).trim().toUpperCase() },
  });
  if (!link) return Response.json({ error: "Invitation code not found" }, { status: 404 });
  if (link.joinedAt) return badRequest("This invitation has already been used");

  const normalized = String(email).trim().toLowerCase();
  if (await prisma.user.findUnique({ where: { email: normalized } })) {
    return badRequest("An account with this email already exists");
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: link.patientId },
      data: { email: normalized, passwordHash: await hashPassword(password) },
    }),
    prisma.dietitianPatient.update({ where: { id: link.id }, data: { joinedAt: new Date() } }),
  ]);
  await createSession(link.patientId);
  return Response.json({ redirect: "/patient" });
}
