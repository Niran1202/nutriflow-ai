import { askLLM, type ChatTurn } from "../llm";
import { dietConflicts, proteinSuggestions } from "../foods";
import type { Intent, MonitoringReport, NutritionSnapshot, PatientContext } from "./types";

const GUARDRAILS = `You are the NutriFlow AI coaching assistant. You support a patient on behalf of their dietitian.

Hard rules:
- The dietitian's plan (targets, diet type, restrictions) is fixed. Never change, raise, lower or question targets, and never invent new targets.
- Only suggest foods from the "Plan-compatible foods" list in the facts, or plain vegetables, fruit and whole grains.
- Only use numbers that appear in the facts. Never estimate calories or protein for dishes yourself.
- Do not diagnose, do not give medical advice, and do not discuss medication or supplements.
- Speak directly to the patient by first name, warmly and without judgement.
- Keep it short: at most 3-4 sentences, or one sentence plus a list of at most 3 bullets. No headings.`;

/** What the Coaching Agent should do for each intent the Supervisor routed. */
const TASKS: Partial<Record<Intent, string>> = {
  protein: "Tell them how much protein they still need today (use the 'Still needed today' number) and suggest 2-3 foods from the plan-compatible list for their next meal. If you mention protein amounts, quote only the per-100 g values from the facts.",
  calories: "Tell them how many kcal they still have for today (or that they are over, if the number is negative) and give one practical tip for their next meal.",
  water: "Tell them how much water they still need today and give one practical tip to get there.",
  meal_idea: "Suggest 2 simple ideas for their next meal that combine a plan-compatible protein food with vegetables or grains, fitting their cuisine preferences. Do not give nutrition numbers for the ideas.",
  progress: "Summarise their recent days using the averages vs targets and adherence: one thing going well, the main pattern to work on, and one small step for today.",
  struggling: "Acknowledge that it's hard, without judgement. Briefly reflect the main pattern from the recent averages, then suggest ONE small, realistic step for today. Mention that their dietitian can see their logs and will help.",
  general: "Reply briefly and naturally to exactly what they said. Only mention food or numbers if they asked. You can offer help with protein, calories, water, meal ideas or their week.",
};

export type CoachingInput = {
  intent: Intent;
  message: string;
  patient: PatientContext;
  nutrition?: NutritionSnapshot;
  monitoring?: MonitoringReport;
};

export type CoachingOutput = { reply: string; usedLLM: boolean; blocked?: string };

/**
 * Coaching Agent — gives plan-aligned, general guidance using the facts the
 * other agents gathered. Uses the local LLM when available (with an output
 * guardrail), otherwise deterministic templates built from the same data.
 */
export async function runCoachingAgent(input: CoachingInput): Promise<CoachingOutput> {
  // Fixed responses: these must never be left to the model's wording.
  if (input.intent === "safety") {
    return { reply: safetyReply(input.patient), usedLLM: false };
  }
  if (input.intent === "plan_change") {
    return {
      reply: `Your plan is set by your dietitian, so I can't change it, ${input.patient.firstName} — but I've passed your request on for them to review. Until then, I'm happy to help you work within your current plan.`,
      usedLLM: false,
    };
  }

  const history: ChatTurn[] = input.patient.recentConversation
    .filter((m) => m.role !== "dietitian")
    .slice(-4)
    .map((m) => ({ role: m.role === "patient" ? "user" : "assistant", content: m.content }));

  const facts = buildFacts(input);
  const llm = await askLLM(
    GUARDRAILS,
    `FACTS (from the NutriFlow agents — the only numbers you may use):\n${facts}\n\nTASK: ${TASKS[input.intent] ?? TASKS.general}\n\nPatient message: "${input.message}"`,
    history,
  );
  if (!llm) return { reply: templateReply(input), usedLLM: false };

  // Output guardrail: a small model can still drift, so check before the patient sees it.
  const problem = checkReply(llm, input.patient, facts);
  if (problem) {
    console.warn(`[coaching] LLM reply blocked (${problem}):`, llm);
    return { reply: templateReply(input), usedLLM: true, blocked: problem };
  }
  return { reply: tidy(llm), usedLLM: true };
}

/** The chat renders plain text: turn markdown bullets into "•" and drop bold/headings. */
function tidy(text: string): string {
  return text
    .replace(/^\s*[*-]\s+/gm, "• ")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^#+\s*/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const PLAN_CHANGE = /\b(new|increase|raise|lower|reduce|change|adjust|set)\w*\s+(your\s+)?(daily\s+)?(calorie|protein|water)?\s*(target|goal)s?\s+(to|of)\b/i;
const MEDICAL = /\b(diagnos\w*|prescri\w*|medication|dosage|\d+\s?mg|insulin|you (may|might) have)\b/i;

/** Why an LLM reply must not reach the patient, or null if it's fine. */
export function checkReply(reply: string, patient: PatientContext, facts: string): string | null {
  if (PLAN_CHANGE.test(reply)) return "tried to change the plan";
  const unverified = ungroundedNumbers(reply, facts);
  if (unverified.length) return `unverified numbers: ${unverified.join(", ")}`;
  if (MEDICAL.test(reply)) return "medical advice";
  const conflicts = dietConflicts(reply, patient.dietType, patient.restrictions);
  if (conflicts.length) return `suggested ${conflicts.join(", ")} (not in ${patient.dietType.toLowerCase()} plan / restrictions)`;
  return null;
}

/**
 * Nutrition figures (g / kcal / L) in the reply that don't appear in the facts.
 * Stops the model presenting its own estimates as if they were the patient's data.
 */
function ungroundedNumbers(reply: string, facts: string): string[] {
  const known = new Set((facts.match(/\d+(?:\.\d+)?/g) ?? []).map(Number));
  const claims = reply.matchAll(/(\d+(?:\.\d+)?)\s*(g|grams?|kcal|calories|l|litres?|liters?)\b/gi);
  return [...claims].filter((m) => !known.has(Number(m[1]))).map((m) => m[0]);
}

function buildFacts(input: CoachingInput): string {
  const { patient, nutrition, monitoring } = input;
  const t = patient.targets;
  const lines = [
    `- Patient: ${patient.firstName}. Goal: ${patient.goal}. Diet: ${patient.dietType}. Cuisine preferences: ${patient.preferences}. Restrictions: ${patient.restrictions}.`,
    `- Daily targets set by the dietitian: ${t.calorieTarget} kcal, ${t.proteinTarget} g protein, ${t.waterTarget} L water.`,
  ];
  if (nutrition) {
    const c = nutrition.consumed;
    const r = nutrition.remaining;
    const still = (n: number, unit: string) => (n > 0 ? `${n} ${unit}` : `none (target reached${n < 0 ? `, ${Math.abs(n)} ${unit} over` : ""})`);
    lines.push(
      `- Eaten/drunk so far today: ${c.calories} kcal, ${Math.round(c.protein)} g protein, ${c.water} L water.`,
      `- Still needed today: ${still(r.calories, "kcal")}; ${still(Math.round(r.protein), "g protein")}; ${still(r.water, "L water")}.`,
      `- Meals logged today: ${nutrition.mealsLogged.join(", ") || "none"}. Their next meal is ${nextMeal(nutrition)}.`,
    );
  }
  if (monitoring?.averages) {
    const a = monitoring.averages;
    lines.push(`- Averages over the last ${monitoring.completedDays} days: ${a.calories} kcal (target ${t.calorieTarget}), ${Math.round(a.protein)} g protein (target ${t.proteinTarget}), ${a.water} L water (target ${t.waterTarget}). Adherence ${monitoring.adherence ?? "n/a"}%.`);
  }
  if (monitoring?.findings.length) {
    lines.push(`- Pattern the Monitoring Agent found: ${monitoring.findings.map((f) => f.reason).join(" ")}`);
  }
  const ideas = proteinSuggestions(patient.dietType, patient.restrictions, patient.preferences, 5);
  if (ideas.length) {
    lines.push(`- Plan-compatible foods (protein per 100 g): ${ideas.map((f) => `${f.name.replace(/ \(.*\)/, "")} ${f.protein} g`).join("; ")}.`);
  }
  return lines.join("\n");
}

function templateReply({ intent, patient, nutrition, monitoring }: CoachingInput): string {
  const ideas = proteinSuggestions(patient.dietType, patient.restrictions, patient.preferences, 3);
  const ideaText = ideas.map((f) => `${f.name.toLowerCase()} (${f.protein} g protein per 100 g)`).join(", ");
  const r = nutrition?.remaining;

  switch (intent) {
    case "protein": {
      if (!r) break;
      if (r.protein <= 0) return `Nice work, ${patient.firstName} — you've already reached your ${patient.targets.proteinTarget} g protein target today.`;
      return `You have about ${Math.round(r.protein)} g of your ${patient.targets.proteinTarget} g protein target remaining today. Options that fit your ${patient.dietType.toLowerCase()} plan: ${ideaText}. Try adding one of these to ${nextMeal(nutrition!)}.`;
    }
    case "calories": {
      if (!r) break;
      if (r.calories < 0) return `You're about ${Math.abs(r.calories)} kcal over your ${patient.targets.calorieTarget} kcal target today. No need to compensate drastically — just keep the rest of today light and plan-aligned, and your dietitian can review the week.`;
      return `You have about ${r.calories} kcal left of your ${patient.targets.calorieTarget} kcal target today${nutrition!.mealsMissing.length ? `, with ${nutrition!.mealsMissing.join(" and ").toLowerCase()} still to log` : ""}.`;
    }
    case "water": {
      if (!r) break;
      if (r.water <= 0) return `You've reached your ${patient.targets.waterTarget} L water target today — well done.`;
      return `You have about ${r.water} L of your ${patient.targets.waterTarget} L water target left today. Spreading it out — a glass with each meal and one between — usually makes it easier.`;
    }
    case "meal_idea":
      return `For your next meal, build around a protein source that fits your plan — for example ${ideaText} — with vegetables and a portion of whole grains.${r ? ` You have about ${r.calories} kcal and ${Math.round(r.protein)} g protein left for today.` : ""}`;
    case "progress":
    case "struggling": {
      const opener = intent === "struggling"
        ? `Thanks for being honest, ${patient.firstName} — that's genuinely useful for your dietitian to know.`
        : `Here's how your week looks, ${patient.firstName}.`;
      const stats = monitoring?.averages
        ? ` Over the last ${monitoring.completedDays} days you've averaged ${monitoring.averages.protein} g protein (target ${patient.targets.proteinTarget} g) and ${monitoring.averages.calories} kcal (target ${patient.targets.calorieTarget} kcal).`
        : "";
      const pattern = monitoring?.findings[0]
        ? ` The main thing to focus on: ${monitoring.findings[0].reason.charAt(0).toLowerCase()}${monitoring.findings[0].reason.slice(1)} Your dietitian has been notified and will review it.`
        : "";
      const step = ` One small step for today: add one plan-friendly protein source such as ${ideas[0]?.name.toLowerCase() ?? "a legume dish"}.`;
      return opener + stats + pattern + step;
    }
  }
  const status = r
    ? ` Right now you have ${r.calories} kcal, ${Math.round(r.protein)} g protein and ${r.water} L water left for today.`
    : "";
  return `I can help with your protein, calories, water, meal ideas, or how your week is going, ${patient.firstName}.${status} Your dietitian sets your plan; I help you stick to it.`;
}

/** The next main meal still to come today, judged by the clock. */
function nextMeal(n: NutritionSnapshot): string {
  const h = new Date().getHours();
  const upcoming = n.mealsMissing.filter((m) => (m === "Breakfast" ? h < 11 : m === "Lunch" ? h < 16 : true));
  return upcoming[0]?.toLowerCase() ?? "your next snack";
}

function safetyReply(patient: PatientContext): string {
  return `Thank you for telling me, ${patient.firstName}. This is something your dietitian or doctor should look at directly, so I've flagged it for your dietitian's review. If you feel unwell or it's urgent, please contact a doctor or emergency services right away.`;
}
