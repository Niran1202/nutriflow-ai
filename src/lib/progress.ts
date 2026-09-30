import { prisma } from "./db";
import { lastNDays, today } from "./dates";
import { round1 } from "./foods";

export type DayTotals = {
  date: string;
  calories: number;
  protein: number;
  water: number;
  mealCount: number;
};

/** Recent window: the last 7 completed days plus today (still in progress). */
export const RECENT_WINDOW = 8;

export type Targets = { calorieTarget: number; proteinTarget: number; waterTarget: number };

/** Re-derive a day's calorie/protein totals from its meals, keeping water. */
export async function recomputeDailyProgress(patientId: string, date: string) {
  const agg = await prisma.meal.aggregate({
    where: { patientId, date },
    _sum: { calories: true, protein: true },
  });
  const calories = agg._sum.calories ?? 0;
  const protein = agg._sum.protein ?? 0;
  await prisma.dailyProgress.upsert({
    where: { patientId_date: { patientId, date } },
    create: { patientId, date, calories, protein },
    update: { calories, protein },
  });
}

export async function addWater(patientId: string, litres: number, date = today()) {
  const current = await prisma.dailyProgress.findUnique({
    where: { patientId_date: { patientId, date } },
  });
  const water = Math.max(0, round1((current?.water ?? 0) + litres));
  await prisma.dailyProgress.upsert({
    where: { patientId_date: { patientId, date } },
    create: { patientId, date, water },
    update: { water },
  });
  return water;
}

/** Totals for each of the last `n` days (oldest first), zero-filled. */
export async function getRecentDays(patientId: string, n = RECENT_WINDOW): Promise<DayTotals[]> {
  const days = lastNDays(n);
  const [rows, meals] = await Promise.all([
    prisma.dailyProgress.findMany({ where: { patientId, date: { in: days } } }),
    prisma.meal.groupBy({
      by: ["date"],
      where: { patientId, date: { in: days } },
      _count: { _all: true },
    }),
  ]);
  return days.map((date) => {
    const r = rows.find((x) => x.date === date);
    const m = meals.find((x) => x.date === date);
    return {
      date,
      calories: Math.round(r?.calories ?? 0),
      protein: round1(r?.protein ?? 0),
      water: round1(r?.water ?? 0),
      mealCount: m?._count._all ?? 0,
    };
  });
}

/**
 * Per-day adherence score in [0,1]: mean of
 *  - protein: fraction of target reached (capped at 1)
 *  - calories: 1 minus relative deviation from target (either direction)
 *  - water: fraction of target reached (capped at 1)
 * A day with nothing logged scores 0.
 */
export function dayAdherence(day: DayTotals, t: Targets): number {
  if (day.mealCount === 0 && day.water === 0) return 0;
  const protein = Math.min(day.protein / t.proteinTarget, 1);
  const calories = Math.max(0, 1 - Math.abs(day.calories - t.calorieTarget) / t.calorieTarget);
  const water = Math.min(day.water / t.waterTarget, 1);
  return (protein + calories + water) / 3;
}

/**
 * Adherence % over recent completed days. Days before the patient joined are
 * ignored, and today is excluded because it is still in progress. Returns null
 * until the patient has at least one completed day.
 */
export function adherencePercent(days: DayTotals[], t: Targets, joinedDay?: string): number | null {
  const todayStr = today();
  const counted = days.filter((d) => d.date !== todayStr && (!joinedDay || d.date >= joinedDay));
  if (counted.length === 0) return null;
  const avg = counted.reduce((s, d) => s + dayAdherence(d, t), 0) / counted.length;
  return Math.round(avg * 100);
}
