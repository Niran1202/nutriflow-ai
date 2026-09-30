import { PrismaClient } from "@/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

function createClient() {
  const adapter = new PrismaLibSql({
    url: process.env.DATABASE_URL ?? "file:./nutriflow.db",
  });
  return new PrismaClient({ adapter });
}

// Reuse one client across hot reloads in dev.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
