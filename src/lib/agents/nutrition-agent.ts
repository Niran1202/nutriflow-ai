import { prisma } from "../db";
import { today } from "../dates";
import { FOODS, round1, type FoodItem } from "../foods";
import { askJSON } from "../llm";
import type { NutritionSnapshot } from "./types";

const MAIN_MEALS = ["Breakfast", "Lunch", "Dinner"];

/**
 * Nutrition Agent — analyses what the patient has logged today against the
 * dietitian's targets and works out what remains.
 */
export async function runNutritionAgent(patientId: string, date = today()): Promise<NutritionSnapshot> {
  const [meals, progress, target] = await Promise.all([
    prisma.meal.findMany({ where: { patientId, date } }),
    prisma.dailyProgress.findUnique({ where: { patientId_date: { patientId, date } } }),
    prisma.nutritionTarget.findUniqueOrThrow({ where: { patientId } }),
  ]);

  const consumed = meals.reduce(
    (s, m) => ({
      calories: s.calories + m.calories,
      protein: s.protein + m.protein,
      carbs: s.carbs + m.carbs,
      fat: s.fat + m.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
  const water = progress?.water ?? 0;
  const logged = [...new Set(meals.map((m) => m.mealType))];

  return {
    date,
    consumed: {
      calories: Math.round(consumed.calories),
      protein: round1(consumed.protein),
      carbs: round1(consumed.carbs),
      fat: round1(consumed.fat),
      water: round1(water),
    },
    remaining: {
      calories: Math.round(target.calorieTarget - consumed.calories),
      protein: round1(target.proteinTarget - consumed.protein),
      water: round1(target.waterTarget - water),
    },
    mealsLogged: logged,
    mealsMissing: MAIN_MEALS.filter((m) => !logged.includes(m)),
  };
}

// ---------------------------------------------------------------------------
// Natural-language meal parsing
// ---------------------------------------------------------------------------

export type ParsedMeal = { items: FoodItem[]; unmatched: string[]; usedLLM: boolean };

const PORTION_HINTS = `Typical portions: 1 roti/chapati = 40 g; 1 slice bread = 30 g; 1 bowl cooked rice, dal, beans or pasta = 200 g; 1 cup milk = 250 g; 1 bowl curd/yogurt = 150 g; 1 egg = 50 g; 1 banana = 120 g; 1 apple = 150 g; 1 handful nuts = 25 g; 1 tbsp oil/ghee/peanut butter = 10-15 g; 1 serving paneer/tofu = 100 g; 1 chicken breast / fish fillet = 150 g; 1 scoop whey = 30 g; 1 portion vegetables/salad = 150 g.`;

const NOT_IN_LIST = "NOT IN LIST";

/**
 * Nutrition Agent tool: turn "2 rotis with dal and a bowl of curd" into
 * foods from the local dataset with gram amounts. Output is schema-constrained:
 * each item must quote the words it came from and pick a food by its readable
 * name (or NOT IN LIST), which keeps a small model from inventing extra items.
 * The patient reviews the result before anything is saved.
 */
export async function parseMealText(text: string): Promise<ParsedMeal> {
  const byName = new Map(Object.entries(FOODS).map(([key, f]) => [f.name, key]));
  const names = [...byName.keys()];
  const llm = await askJSON(
    `You split a patient's meal description into the separate foods they mentioned.
For each food write: "mentioned" = the exact words from the description, "food" = the closest item from the FOOD LIST (or "${NOT_IN_LIST}" if nothing is a reasonable match), "grams" = estimated amount eaten.
Only list foods the patient actually mentioned — one entry per food, never extra items.

FOOD LIST:
${names.join("\n")}

${PORTION_HINTS}`,
    `Meal description: "${text}"`,
    {
      type: "object",
      properties: {
        items: {
          type: "array",
          maxItems: 10,
          items: {
            type: "object",
            properties: {
              mentioned: { type: "string" },
              food: { type: "string", enum: [...names, NOT_IN_LIST] },
              grams: { type: "number" },
            },
            required: ["mentioned", "food", "grams"],
          },
        },
      },
      required: ["items"],
    },
    (v) => {
      const raw = (v as { items?: { mentioned: string; food: string; grams: number }[] })?.items;
      if (!Array.isArray(raw)) return null;
      const grams = new Map<string, number>();
      const unmatched: string[] = [];
      for (const i of raw) {
        const key = byName.get(i.food);
        if (!key) {
          if (i.mentioned?.trim()) unmatched.push(i.mentioned.trim());
          continue;
        }
        if (!(i.grams > 0 && i.grams <= 1500)) continue;
        grams.set(key, (grams.get(key) ?? 0) + i.grams); // merge duplicates
      }
      const items = [...grams].map(([key, g]) => ({ key, grams: Math.round(g) }));
      return { items, unmatched: unmatched.slice(0, 5) };
    },
    900,
  );
  if (llm && (llm.items.length || llm.unmatched.length)) return { ...llm, usedLLM: true };
  return { ...keywordParse(text), usedLLM: false };
}

/** Fallback without a model: match dataset names by keyword, 100 g each. */
function keywordParse(text: string): Omit<ParsedMeal, "usedLLM"> {
  const t = text.toLowerCase();
  const items: FoodItem[] = [];
  for (const [key, f] of Object.entries(FOODS)) {
    const words = [key.replace(/_/g, " "), ...f.name.toLowerCase().split(/[\/(),]/).map((w) => w.trim())]
      .filter((w) => w.length > 2 && !["cooked", "dry", "plain", "whole"].includes(w));
    if (words.some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?\\b`).test(t))) {
      items.push({ key, grams: 100 });
    }
  }
  return { items, unmatched: [] };
}
