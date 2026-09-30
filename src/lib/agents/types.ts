import type { DayTotals, Targets } from "../progress";

export type PatientContext = {
  patientId: string;
  name: string;
  firstName: string;
  goal: string;
  dietType: string;
  preferences: string;
  restrictions: string;
  targets: Targets;
  joinedDay: string | null;
  recentConversation: { role: string; content: string }[];
};

export type NutritionSnapshot = {
  date: string;
  consumed: { calories: number; protein: number; carbs: number; fat: number; water: number };
  remaining: { calories: number; protein: number; water: number };
  mealsLogged: string[];
  mealsMissing: string[];
};

export type FindingType =
  | "PROTEIN_LOW"
  | "CALORIES_HIGH"
  | "CALORIES_LOW"
  | "WATER_LOW"
  | "LOGGING_GAP"
  | "PATIENT_CONCERN";

export type Finding = {
  type: FindingType;
  severity: "info" | "warning" | "high";
  reason: string;
  evidence: Record<string, unknown>;
};

export type MonitoringReport = {
  days: DayTotals[];
  completedDays: number;
  averages: { calories: number; protein: number; water: number } | null;
  adherence: number | null;
  findings: Finding[];
};

export type Intent =
  | "protein"
  | "calories"
  | "water"
  | "meal_idea"
  | "progress"
  | "struggling"
  | "safety"
  | "plan_change"
  | "general";

export type Trigger = "chat" | "meal_logged" | "review";

export type TraceEntry = { agent: string; summary: string };
