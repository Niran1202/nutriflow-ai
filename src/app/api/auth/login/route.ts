import { prisma } from "@/lib/db";
import { badRequest, createSession, verifyPassword } from "@/lib/auth";
import { clearAttempts, clientIp, rateLimited, tooManyAttempts } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const { email, password } = await req.json();
  if (!email || !password) return badRequest("Email and password are required");
  const normalized = String(email).trim().toLowerCase();

  // Limit per IP, and per IP+account. Keying the account limit by IP too means a
  // stranger can't lock the real dietitian out by spamming wrong passwords.
  const ip = clientIp(req);
  const ipKey = `login-ip:${ip}`;
  const accountKey = `login-account:${ip}:${normalized}`;
  const wait = tooManyAttempts(ipKey, 30) ?? tooManyAttempts(accountKey, 10);
  if (wait) return rateLimited(wait);

  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    return Response.json({ error: "Invalid email or password" }, { status: 401 });
  }
  clearAttempts(accountKey);
  await createSession(user.id);
  return Response.json({ redirect: user.role === "DIETITIAN" ? "/dietitian" : "/patient" });
}
