import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";

export const SESSION_COOKIE = "nf_session";
const SESSION_DAYS = 14;

export type Role = "DIETITIAN" | "PATIENT";

export type SessionUser = {
  id: string;
  name: string;
  email: string | null;
  role: Role;
};

export function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { id: token, userId, expiresAt } });
  const jar = await cookies();
  // Behind the HTTPS tunnel the cookie must be Secure; plain localhost stays usable.
  const secure = (await headers()).get("x-forwarded-proto") === "https";
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { id: token } });
  jar.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { id: token },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  const { id, name, email, role } = session.user;
  return { id, name, email, role: role as Role };
}

/** For server components: redirect away unless the user has `role`. */
export async function requireRole(role: Role): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== role) redirect(user.role === "DIETITIAN" ? "/dietitian" : "/patient");
  return user;
}

/** For route handlers: returns the user or null (caller sends 401/403). */
export async function apiUser(role?: Role): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  if (role && user.role !== role) return null;
  return user;
}

/** Throws unless `patientId` belongs to `dietitianId`. */
export async function assertOwnsPatient(dietitianId: string, patientId: string) {
  const link = await prisma.dietitianPatient.findUnique({ where: { patientId } });
  if (!link || link.dietitianId !== dietitianId) {
    throw new Error("FORBIDDEN");
  }
  return link;
}

/** Invitation code like NF-8K29-XP (no ambiguous characters). */
export function generateInvitationCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const pick = (n: number) =>
    Array.from(randomBytes(n), (b) => alphabet[b % alphabet.length]).join("");
  return `NF-${pick(4)}-${pick(2)}`;
}

export function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export function badRequest(error: string) {
  return Response.json({ error }, { status: 400 });
}
