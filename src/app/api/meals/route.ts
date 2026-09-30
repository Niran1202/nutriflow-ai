import { after } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, badRequest, unauthorized } from "@/lib/auth";
import { today } from "@/lib/dates";
import { describeItems, macrosFor, type FoodItem } from "@/lib/foods";
import { recomputeDailyProgress } from "@/lib/progress";
import { runSupervisor } from "@/lib/agents/supervisor";

const MEAL_TYPES = ["Breakfast", "Lunch", "Dinner", "Snack"];

/**
 * Log a meal. Either `items` (foods from the local dataset + grams) or manual
 * `food` + macros. After responding, the supervisor runs the monitoring
 * pipeline in the background so logging stays fast even with a slow local LLM.
 */
export async function POST(req: Request) {
  const me = await apiUser("PATIENT");
  if (!me) return unauthorized();

  const b = await req.json();
  if (!MEAL_TYPES.includes(b.mealType)) return badRequest("Choose a meal type");

  let food: string;
  let macros: { calories: number; protein: number; carbs: number; fat: number };
  if (Array.isArray(b.items)) {
    const items = b.items as FoodItem[];
    food = describeItems(items);
    macros = macrosFor(items);
    if (!food) return badRequest("Add at least one food with a quantity");
  } else {
    food = String(b.food ?? "").trim();
    macros = {
      calories: Number(b.calories) || 0,
      protein: Number(b.protein) || 0,
      carbs: Number(b.carbs) || 0,
      fat: Number(b.fat) || 0,
    };
    if (!food) return badRequest("Describe the food");
    if (Object.values(macros).some((v) => v < 0)) return badRequest("Values cannot be negative");
  }

  const date = today();
  await prisma.meal.create({ data: { patientId: me.id, date, mealType: b.mealType, food, ...macros } });
  await recomputeDailyProgress(me.id, date);

  after(async () => {
    try {
      await runSupervisor({ patientId: me.id, trigger: "meal_logged" });
    } catch (err) {
      console.error("[meals] supervisor run failed:", err);
    }
  });
  return Response.json({ ok: true });
}
