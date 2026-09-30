import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { prisma } from "../db";
import { dayString } from "../dates";
import { askJSON, askLLM } from "../llm";
import { runCoachingAgent } from "./coaching-agent";
import { logAgentEvent } from "./events";
import { runMonitoringAgent } from "./monitoring-agent";
import { runNutritionAgent } from "./nutrition-agent";
import { runPatientAgent } from "./patient-agent";
import type {
  Finding,
  Intent,
  MonitoringReport,
  NutritionSnapshot,
  PatientContext,
  TraceEntry,
  Trigger,
} from "./types";

type AgentNode = "patient_agent" | "nutrition_agent" | "monitoring_agent";

const State = Annotation.Root({
  patientId: Annotation<string>,
  trigger: Annotation<Trigger>,
  message: Annotation<string>,
  intent: Annotation<Intent>,
  plan: Annotation<AgentNode[]>,
  patient: Annotation<PatientContext | undefined>,
  nutrition: Annotation<NutritionSnapshot | undefined>,
  monitoring: Annotation<MonitoringReport | undefined>,
  reply: Annotation<string | undefined>,
  usedLLM: Annotation<boolean>({ reducer: (a, b) => a || b, default: () => false }),
  alertsCreated: Annotation<string[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  trace: Annotation<TraceEntry[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
});

type S = typeof State.State;

// ---------------------------------------------------------------------------
// Supervisor: routing
// ---------------------------------------------------------------------------

const INTENT_RULES: [Intent, RegExp][] = [
  ["safety", /chest pain|dizz|faint|pregnan|vomit|bulimi|anorexi|binge|purg|starv|suicid|self.?harm|allergic reaction|blood sugar|insulin|medication|medicine|diabet|kidney|symptom/i],
  ["plan_change", /(change|increase|lower|reduce|raise|modify|adjust|update)\b.{0,30}\b(plan|target|goal|calorie|protein|diet)|new plan/i],
  ["struggling", /struggl|haven'?t been able|not been able|can'?t stick|couldn'?t stick|can'?t follow|couldn'?t follow|not able to follow|off track|fell off|hard to (follow|stick)|difficult to (follow|stick)|gave up|not following|failing/i],
  ["progress", /progress|how am i doing|how'?s my week|this week|adherence|on track|how did i do/i],
  ["protein", /protein/i],
  ["water", /water|hydrat|drink/i],
  ["calories", /calori|kcal|how much (more )?can i eat|energy intake/i],
  ["meal_idea", /what (should|can|do) i eat|meal idea|suggest|recipe|dinner|lunch|breakfast|snack|hungry/i],
];

export function classifyIntent(message: string): Intent {
  return INTENT_RULES.find(([, re]) => re.test(message))?.[0] ?? "general";
}

const GUARDRAIL_INTENTS: Intent[] = ["safety", "plan_change"];
const LLM_INTENTS: Intent[] = ["safety", "plan_change", "protein", "calories", "water", "meal_idea", "progress", "struggling", "general"];

const ROUTER_PROMPT = `You are the supervisor of a nutrition-coaching system. Classify the patient's message into exactly one intent:
- safety: any physical symptom, feeling unwell, pain, medical condition, medication, pregnancy, or signs of disordered eating
- plan_change: asking to change, raise or lower their targets, goals or diet plan
- protein: about protein intake or protein foods
- calories: about calories / energy / how much they can still eat
- water: about water or hydration
- meal_idea: asking what to eat, for meal or snack ideas or recipes
- progress: asking how they are doing over the week / overall
- struggling: saying they find the plan hard, fell off track, or failed to follow it
- general: greetings or anything else`;

/**
 * Two-stage routing. Safety and plan-change requests are caught by fixed rules
 * first (a guardrail the model can't override); everything else is classified
 * by the local LLM with schema-constrained output, falling back to rules. The
 * LLM may still escalate to safety/plan_change when it spots a paraphrase the
 * rules missed, but it can never downgrade a rule match.
 */
async function routeIntent(message: string): Promise<{ intent: Intent; by: "guardrail" | "llm" | "rules" }> {
  const ruled = classifyIntent(message);
  if (GUARDRAIL_INTENTS.includes(ruled)) return { intent: ruled, by: "guardrail" };
  const llm = await askJSON(
    ROUTER_PROMPT,
    `Patient message: "${message}"`,
    {
      type: "object",
      properties: { intent: { type: "string", enum: LLM_INTENTS } },
      required: ["intent"],
    },
    (v) => {
      const intent = (v as { intent?: string })?.intent as Intent;
      return LLM_INTENTS.includes(intent) ? intent : null;
    },
  );
  return llm ? { intent: llm, by: "llm" } : { intent: ruled, by: "rules" };
}

function planFor(trigger: Trigger, intent: Intent): AgentNode[] {
  if (trigger !== "chat") return ["patient_agent", "nutrition_agent", "monitoring_agent"];
  switch (intent) {
    case "safety":
    case "plan_change":
      return ["patient_agent"];
    case "progress":
    case "struggling":
      return ["patient_agent", "nutrition_agent", "monitoring_agent"];
    default:
      return ["patient_agent", "nutrition_agent"];
  }
}

async function supervisorRoute(state: S): Promise<Partial<S>> {
  const { intent, by } = state.trigger === "chat" ? await routeIntent(state.message) : { intent: "general" as Intent, by: "rules" as const };
  const plan = planFor(state.trigger, intent);
  await logAgentEvent(state.patientId, "Supervisor", "route", { trigger: state.trigger, intent, routedBy: by, plan });
  const how = { guardrail: "safety guardrail", llm: "local LLM", rules: "rules" }[by];
  return {
    intent,
    plan,
    usedLLM: by === "llm",
    trace: [{ agent: "Supervisor", summary: `${state.trigger === "chat" ? `Intent "${intent}" (${how})` : `Trigger "${state.trigger}"`} → ${plan.map(labelOf).join(", ")}` }],
  };
}

function labelOf(node: string) {
  return node.replace("_agent", "").replace(/^\w/, (c) => c.toUpperCase()) + " Agent";
}

// ---------------------------------------------------------------------------
// Specialist agent nodes
// ---------------------------------------------------------------------------

async function patientNode(state: S): Promise<Partial<S>> {
  const patient = await runPatientAgent(state.patientId);
  await logAgentEvent(state.patientId, "Patient Agent", "load_profile", {
    goal: patient.goal,
    dietType: patient.dietType,
    targets: patient.targets,
  });
  return {
    patient,
    trace: [{ agent: "Patient Agent", summary: `Loaded ${patient.dietType.toLowerCase()} plan: ${patient.targets.calorieTarget} kcal / ${patient.targets.proteinTarget} g protein / ${patient.targets.waterTarget} L` }],
  };
}

async function nutritionNode(state: S): Promise<Partial<S>> {
  const nutrition = await runNutritionAgent(state.patientId);
  await logAgentEvent(state.patientId, "Nutrition Agent", "analyse_today", nutrition);
  const r = nutrition.remaining;
  return {
    nutrition,
    trace: [{ agent: "Nutrition Agent", summary: `Remaining today: ${r.calories} kcal, ${r.protein} g protein, ${r.water} L water` }],
  };
}

async function monitoringNode(state: S): Promise<Partial<S>> {
  const [target, link] = await Promise.all([
    prisma.nutritionTarget.findUniqueOrThrow({ where: { patientId: state.patientId } }),
    prisma.dietitianPatient.findUnique({ where: { patientId: state.patientId } }),
  ]);
  const monitoring = await runMonitoringAgent(
    state.patientId,
    target,
    link?.joinedAt ? dayString(link.joinedAt) : null,
  );
  await logAgentEvent(state.patientId, "Monitoring Agent", "analyse_trend", {
    completedDays: monitoring.completedDays,
    averages: monitoring.averages,
    adherence: monitoring.adherence,
    findings: monitoring.findings.map((f) => f.type),
  });
  return {
    monitoring,
    trace: [{
      agent: "Monitoring Agent",
      summary: monitoring.findings.length
        ? `Detected: ${monitoring.findings.map((f) => f.type).join(", ")}`
        : `No sustained deviations over ${monitoring.completedDays} completed days`,
    }],
  };
}

async function gatherNode(state: S): Promise<Partial<S>> {
  const got = [state.patient && "profile", state.nutrition && "today", state.monitoring && "trend"].filter(Boolean);
  return { trace: [{ agent: "Supervisor", summary: `Merged agent outputs (${got.join(", ")})` }] };
}

async function coachingNode(state: S): Promise<Partial<S>> {
  const { reply, usedLLM, blocked } = await runCoachingAgent({
    intent: state.intent,
    message: state.message,
    patient: state.patient!,
    nutrition: state.nutrition,
    monitoring: state.monitoring,
  });
  await logAgentEvent(state.patientId, "Coaching Agent", blocked ? "reply_guardrail_blocked" : "reply", { intent: state.intent, usedLLM, blocked });
  return {
    reply,
    usedLLM,
    trace: [{
      agent: "Coaching Agent",
      summary: blocked
        ? `LLM draft blocked by guardrail (${blocked}) → safe template reply`
        : `Plan-aligned reply (${usedLLM ? "local LLM" : "template"})`,
    }],
  };
}

// ---------------------------------------------------------------------------
// Supervisor: escalation to the dietitian (human in the loop)
// ---------------------------------------------------------------------------

/** Don't re-raise the same alert while one is open or shortly after a review. */
async function isDuplicate(patientId: string, type: string) {
  const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const existing = await prisma.alert.findFirst({
    where: {
      patientId,
      type,
      OR: [{ status: "OPEN" }, { reviewedAt: { gte: since } }],
    },
  });
  return !!existing;
}

function templateExplanation(f: Finding, name: string) {
  const e = f.evidence as { average?: number; target?: number; unit?: string; deviationPercent?: number; consecutiveDays?: number };
  if (e.average !== undefined) {
    return `${name}'s ${String(f.evidence.metric)} intake averaged ${e.average} ${e.unit}/day against a target of ${e.target} ${e.unit}/day (${e.deviationPercent! > 0 ? "+" : ""}${e.deviationPercent}%) over ${e.consecutiveDays} consecutive logged days. This is a sustained pattern rather than a single off day, so a dietitian review is recommended.`;
  }
  return `${f.reason} A dietitian review is recommended.`;
}

/**
 * Case note for the dietitian: the numbers come from the deterministic
 * template (always exact); the LLM only adds what might be worth looking at.
 */
async function explainFinding(f: Finding, patient: PatientContext | undefined, name: string) {
  const facts = templateExplanation(f, name);
  const context = patient
    ? `Goal: ${patient.goal}. Diet: ${patient.dietType}. Preferences: ${patient.preferences}. Restrictions: ${patient.restrictions}.`
    : "";
  const days = (f.evidence.days as { day: string; value: number }[] | undefined)?.map((d) => `${d.day} ${d.value}`).join(", ");
  const llm = await askLLM(
    "You assist a registered dietitian. In 1-2 sentences, suggest what the dietitian might want to explore with this patient given the pattern and their diet/preferences (e.g. likely gaps in food choices, meal timing, practical barriers). Do not restate the numbers, do not recommend changing the plan, and do not give a diagnosis. Refer to the person as \"the patient\" — no gendered pronouns. No greetings, no markdown.",
    `${context}\nPattern: ${f.reason}${days ? `\nDaily values: ${days}` : ""}`,
  );
  const suggestion = llm?.replace(/\s+/g, " ").trim();
  return { text: suggestion ? `${facts} ${suggestion}` : facts, usedLLM: !!suggestion };
}

async function escalateNode(state: S): Promise<Partial<S>> {
  const findings: Finding[] = [...(state.monitoring?.findings ?? [])];
  if (state.trigger === "chat" && (state.intent === "safety" || state.intent === "plan_change")) {
    findings.push({
      type: "PATIENT_CONCERN",
      severity: state.intent === "safety" ? "high" : "info",
      reason: state.intent === "safety"
        ? "Patient raised a possible health concern in the AI chat."
        : "Patient asked for their plan to be changed.",
      evidence: { message: state.message },
    });
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: state.patientId } });
  const created: string[] = [];
  let usedLLM = false;
  for (const f of findings) {
    // Patient concerns are always passed on; pattern alerts are de-duplicated.
    if (f.type !== "PATIENT_CONCERN" && (await isDuplicate(state.patientId, f.type))) continue;
    const explanation = f.type === "PATIENT_CONCERN"
      ? { text: `${user.name} wrote: "${state.message}". The AI assistant did not act on this and referred it to you.`, usedLLM: false }
      : await explainFinding(f, state.patient, user.name);
    usedLLM ||= explanation.usedLLM;
    const alert = await prisma.alert.create({
      data: {
        patientId: state.patientId,
        type: f.type,
        severity: f.severity,
        reason: f.reason,
        explanation: explanation.text,
        evidence: JSON.stringify(f.evidence),
      },
    });
    created.push(alert.id);
  }

  if (created.length) {
    await logAgentEvent(state.patientId, "Supervisor", "escalate", { alerts: created.length, types: findings.map((f) => f.type) });
  }
  return {
    alertsCreated: created,
    usedLLM,
    trace: [{
      agent: "Supervisor",
      summary: created.length ? `Escalated ${created.length} alert(s) to the dietitian — plan unchanged` : "Nothing new to escalate",
    }],
  };
}

// ---------------------------------------------------------------------------
// Graph
// ---------------------------------------------------------------------------

const graph = new StateGraph(State)
  .addNode("supervisor", supervisorRoute)
  .addNode("patient_agent", patientNode)
  .addNode("nutrition_agent", nutritionNode)
  .addNode("monitoring_agent", monitoringNode)
  .addNode("gather", gatherNode)
  .addNode("coaching_agent", coachingNode)
  .addNode("escalate", escalateNode)
  .addEdge(START, "supervisor")
  // Fan out to the chosen specialists in parallel.
  .addConditionalEdges("supervisor", (s: S) => s.plan, ["patient_agent", "nutrition_agent", "monitoring_agent"])
  .addEdge("patient_agent", "gather")
  .addEdge("nutrition_agent", "gather")
  .addEdge("monitoring_agent", "gather")
  .addConditionalEdges("gather", (s: S) => (s.trigger === "chat" ? "coaching_agent" : "escalate"), ["coaching_agent", "escalate"])
  .addEdge("coaching_agent", "escalate")
  .addEdge("escalate", END)
  .compile();

export type SupervisorResult = {
  intent: Intent;
  reply?: string;
  usedLLM: boolean;
  alertsCreated: string[];
  trace: TraceEntry[];
  monitoring?: MonitoringReport;
};

export async function runSupervisor(input: { patientId: string; trigger: Trigger; message?: string }): Promise<SupervisorResult> {
  const out = await graph.invoke({
    patientId: input.patientId,
    trigger: input.trigger,
    message: input.message ?? "",
  });
  return {
    intent: out.intent,
    reply: out.reply,
    usedLLM: out.usedLLM,
    alertsCreated: out.alertsCreated,
    trace: out.trace,
    monitoring: out.monitoring,
  };
}
