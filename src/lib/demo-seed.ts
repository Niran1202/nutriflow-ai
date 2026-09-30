/**
 * Demo data for the end-to-end scenario:
 *  - Demo dietitian (demo@nutriflow.local)
 *
 * LOCAL TESTING ONLY — these accounts have a known password. The live server
 * uses its own database (server-data/) and real accounts from `npm run server:dietitian`.
 *  - Max Weber: 7 days of protein well below target → Monitoring Agent raises an alert
 *  - Anna Müller: on track → stable
 *  - Jonas Klein: created but hasn't joined yet (invitation pending)
 */
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { lastNDays } from "./dates";
import { macrosFor, describeItems, type FoodItem } from "./foods";
import { recomputeDailyProgress } from "./progress";
import { runSupervisor } from "./agents/supervisor";

const PASSWORD = "demo1234";

type MealPlan = Record<string, FoodItem[]>;

// Max: vegetarian, Indian/Mediterranean — lands around 70-78 g protein/day vs a 120 g target.
const MAX_MEALS: MealPlan = {
  Breakfast: [{ key: "oats", grams: 60 }, { key: "milk", grams: 250 }, { key: "banana", grams: 100 }],
  Lunch: [{ key: "rice", grams: 250 }, { key: "lentils", grams: 150 }, { key: "mixed_vegetables", grams: 150 }],
  Dinner: [{ key: "chapati", grams: 120 }, { key: "paneer", grams: 60 }, { key: "spinach", grams: 150 }, { key: "ghee", grams: 10 }],
  Snack: [{ key: "almonds", grams: 20 }, { key: "apple", grams: 150 }],
};

// Anna: Mediterranean omnivore — close to her targets.
const ANNA_MEALS: MealPlan = {
  Breakfast: [{ key: "greek_yogurt", grams: 250 }, { key: "berries", grams: 100 }, { key: "oats", grams: 40 }],
  Lunch: [{ key: "quinoa", grams: 200 }, { key: "chickpeas", grams: 100 }, { key: "greek_salad", grams: 200 }, { key: "olive_oil", grams: 10 }],
  Dinner: [{ key: "salmon", grams: 150 }, { key: "potato", grams: 200 }, { key: "broccoli", grams: 150 }],
  Snack: [{ key: "apple", grams: 150 }, { key: "almonds", grams: 15 }],
};

const MEAL_HOURS: Record<string, number> = { Breakfast: 8, Lunch: 13, Snack: 16, Dinner: 19 };

/** Deterministic ±10% portion variation so each day looks slightly different. */
function jitter(dayIndex: number, mealIndex: number) {
  return 0.9 + (((dayIndex * 7 + mealIndex * 3) % 5) / 5) * 0.2;
}

function atHour(date: string, hour: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d, hour, (hour * 7) % 60);
}

async function logDay(patientId: string, date: string, dayIndex: number, plan: MealPlan, mealTypes: string[], water: number) {
  for (const [i, mealType] of mealTypes.entries()) {
    const items = plan[mealType].map((it) => ({ ...it, grams: Math.round(it.grams * jitter(dayIndex, i)) }));
    await prisma.meal.create({
      data: { patientId, date, mealType, food: describeItems(items), ...macrosFor(items), createdAt: atHour(date, MEAL_HOURS[mealType]) },
    });
  }
  await recomputeDailyProgress(patientId, date);
  await prisma.dailyProgress.update({ where: { patientId_date: { patientId, date } }, data: { water } });
}

/** Wipe the database and load the demo scenario. Used by `npm run db:seed` and the desktop app's first launch. */
export async function seedDemo(log: (msg: string) => void = console.log) {
  log("Resetting database…");
  await prisma.user.deleteMany();

  const hash = await bcrypt.hash(PASSWORD, 10);
  const days = lastNDays(8); // 7 completed days + today
  const todayStr = days[days.length - 1];
  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

  const dietitian = await prisma.user.create({
    data: { name: "Demo Dietitian", email: "demo@nutriflow.local", passwordHash: hash, role: "DIETITIAN" },
  });

  const max = await prisma.user.create({
    data: {
      name: "Max Weber",
      email: "max@nutriflow.local",
      passwordHash: hash,
      role: "PATIENT",
      dietitianLink: { create: { dietitianId: dietitian.id, invitationCode: "NF-8K29-XP", joinedAt: daysAgo(9) } },
      profile: { create: { goal: "Weight management", dietType: "Vegetarian", preferences: "Indian / Mediterranean", restrictions: "None" } },
      target: { create: { calorieTarget: 2200, proteinTarget: 120, waterTarget: 2.5 } },
    },
  });

  const anna = await prisma.user.create({
    data: {
      name: "Anna Müller",
      email: "anna@nutriflow.local",
      passwordHash: hash,
      role: "PATIENT",
      dietitianLink: { create: { dietitianId: dietitian.id, invitationCode: "NF-A7NM-Q3", joinedAt: daysAgo(12) } },
      profile: { create: { goal: "Healthy eating & energy", dietType: "Omnivore", preferences: "Mediterranean", restrictions: "None" } },
      target: { create: { calorieTarget: 1900, proteinTarget: 95, waterTarget: 2.0 } },
    },
  });

  await prisma.user.create({
    data: {
      name: "Jonas Klein",
      role: "PATIENT",
      dietitianLink: { create: { dietitianId: dietitian.id, invitationCode: "NF-7QJM-4T" } },
      profile: { create: { goal: "Muscle gain", dietType: "Omnivore", preferences: "High protein", restrictions: "Lactose intolerance" } },
      target: { create: { calorieTarget: 2800, proteinTarget: 160, waterTarget: 3.0 } },
    },
  });

  log("Logging a week of meals…");
  for (const [i, date] of days.entries()) {
    const isToday = date === todayStr;
    await logDay(max.id, date, i, MAX_MEALS, isToday ? ["Breakfast", "Lunch"] : ["Breakfast", "Lunch", "Snack", "Dinner"], isToday ? 1.8 : [2.1, 2.3, 2.0, 2.4, 2.2, 2.0, 2.3, 2.1][i]);
    await logDay(anna.id, date, i, ANNA_MEALS, isToday ? ["Breakfast"] : ["Breakfast", "Lunch", "Snack", "Dinner"], isToday ? 0.8 : [2.0, 2.1, 1.9, 2.2, 2.0, 2.1, 1.9, 2.0][i]);
  }

  log("Running agent reviews (Supervisor → Patient / Nutrition / Monitoring)…");
  for (const p of [max, anna]) {
    const r = await runSupervisor({ patientId: p.id, trigger: "review" });
    log(`  ${p.name}: ${r.alertsCreated.length} alert(s)`);
    for (const t of r.trace) log(`    · ${t.agent}: ${t.summary}`);
  }

  log(`
Demo ready (local testing only). Password for every account: ${PASSWORD}
  Dietitian  demo@nutriflow.local
  Patient    max@nutriflow.local   (protein alert)
  Patient    anna@nutriflow.local  (stable)
  Pending invitation code for Jonas Klein: NF-7QJM-4T`);
}
