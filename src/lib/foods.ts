import foodsJson from "@/data/foods.json";

/** Nutrition values are per 100 g. */
export type Food = {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  tags: string[];
};

export const FOODS = foodsJson as Record<string, Food>;

export type FoodItem = { key: string; grams: number };

export function macrosFor(items: FoodItem[]) {
  const total = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  for (const { key, grams } of items) {
    const f = FOODS[key];
    if (!f || !(grams > 0)) continue;
    const k = grams / 100;
    total.calories += f.calories * k;
    total.protein += f.protein * k;
    total.carbs += f.carbs * k;
    total.fat += f.fat * k;
  }
  return {
    calories: Math.round(total.calories),
    protein: round1(total.protein),
    carbs: round1(total.carbs),
    fat: round1(total.fat),
  };
}

export function describeItems(items: FoodItem[]) {
  return items
    .filter((i) => FOODS[i.key] && i.grams > 0)
    .map((i) => `${FOODS[i.key].name} ${i.grams} g`)
    .join(", ");
}

/** Which tags a diet type allows. Unknown diets allow everything. */
function allowedTags(dietType: string): string[] | null {
  const d = dietType.toLowerCase();
  if (d.includes("vegan")) return ["vegan"];
  if (d.includes("vegetarian")) return ["vegan", "vegetarian"];
  if (d.includes("pescatarian")) return ["vegan", "vegetarian", "eggetarian", "fish"];
  return null;
}

const DAIRY = /\b(milk|yogh?urt|curd|paneer|cheese|quark|feta|whey|ghee|butter|cream|kefir|lassi)\b/i;
const MEAT = /\b(chicken|beef|pork|lamb|mutton|turkey|bacon|ham|sausage|meat)\b/i;
const FISH = /\b(fish|salmon|tuna|cod|sardines?|mackerel|shrimps?|prawns?|seafood)\b/i;
const EGG = /\beggs?\b/i;

const RESTRICTION_CHECKS: [string, RegExp][] = [
  ["lactose", DAIRY],
  ["dairy", DAIRY],
  ["nut", /\b(almonds?|peanuts?|cashews?|walnuts?|nuts?|peanut butter)\b/i],
  ["peanut", /\bpeanuts?\b/i],
  ["gluten", /\b(bread|pasta|chapati|roti|oats|wheat|barley|couscous)\b/i],
  ["soy", /\b(tofu|tempeh|edamame|soy\w*)\b/i],
  ["egg", EGG],
];

function violatesRestrictions(food: Food, restrictions: string): boolean {
  const r = restrictions.toLowerCase();
  if (!r || r === "none") return false;
  return RESTRICTION_CHECKS.some(([word, re]) => r.includes(word) && re.test(food.name));
}

/**
 * Foods mentioned in free text that conflict with the dietitian-defined diet
 * type or restrictions. Used to check what the LLM suggests before a patient sees it.
 */
export function dietConflicts(text: string, dietType: string, restrictions: string): string[] {
  const d = dietType.toLowerCase();
  const found: string[] = [];
  const hit = (re: RegExp) => {
    const m = text.match(re);
    if (m) found.push(m[0].toLowerCase());
  };
  if (d.includes("vegan")) [MEAT, FISH, EGG, DAIRY].forEach(hit);
  else if (d.includes("vegetarian")) [MEAT, FISH, EGG].forEach(hit);
  else if (d.includes("pescatarian")) hit(MEAT);
  const r = restrictions.toLowerCase();
  if (r && r !== "none") for (const [word, re] of RESTRICTION_CHECKS) if (r.includes(word)) hit(re);
  return [...new Set(found)];
}

/**
 * Protein-dense foods compatible with the dietitian-defined diet type and
 * restrictions, preferring the patient's cuisine preferences.
 */
export function proteinSuggestions(dietType: string, restrictions: string, preferences: string, limit = 4) {
  const allowed = allowedTags(dietType);
  const prefs = preferences.toLowerCase();
  return Object.entries(FOODS)
    .filter(([, f]) => f.tags.includes("protein"))
    .filter(([, f]) => !allowed || f.tags.some((t) => allowed.includes(t)))
    .filter(([, f]) => !violatesRestrictions(f, restrictions))
    .map(([key, f]) => {
      const prefScore = f.tags.some((t) => prefs.includes(t)) ? 1 : 0;
      return { key, food: f, score: prefScore * 10 + f.protein / f.calories * 100 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ key, food }) => ({ key, ...food }));
}

export function round1(n: number) {
  return Math.round(n * 10) / 10;
}
