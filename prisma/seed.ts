/**
 * Reset the local database to the demo scenario (see src/lib/demo-seed.ts).
 * Run with: npm run db:seed   (wipes existing data)
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { seedDemo } from "../src/lib/demo-seed";

seedDemo()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
