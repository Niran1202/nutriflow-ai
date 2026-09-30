import { today, weekdayShort } from "../dates";
import { adherencePercent, getRecentDays, RECENT_WINDOW, type DayTotals, type Targets } from "../progress";
import type { Finding, MonitoringReport } from "./types";

const MIN_STREAK = 3;

/** How many of the most recent days (newest first) satisfy `pred`. */
function trailingStreak(days: DayTotals[], pred: (d: DayTotals) => boolean) {
  let n = 0;
  for (let i = days.length - 1; i >= 0 && pred(days[i]); i--) n++;
  return n;
}

function avg(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function pct(actual: number, target: number) {
  return Math.round(((actual - target) / target) * 100);
}

function series(days: DayTotals[], key: "protein" | "calories" | "water") {
  return days.map((d) => ({ day: weekdayShort(d.date), date: d.date, value: d[key] }));
}

/**
 * Monitoring Agent — looks across multiple days (not just today) for
 * sustained deviations from the dietitian-defined plan. It only reports;
 * it never changes the plan.
 */
export async function runMonitoringAgent(
  patientId: string,
  targets: Targets,
  joinedDay: string | null,
): Promise<MonitoringReport> {
  const days = await getRecentDays(patientId, RECENT_WINDOW);
  const todayStr = today();
  // Completed days since the patient joined. Today is still in progress.
  const completed = days.filter((d) => d.date !== todayStr && (!joinedDay || d.date >= joinedDay));
  const logged = completed.filter((d) => d.mealCount > 0);

  const findings: Finding[] = [];

  // Nutrient streaks are measured over consecutive *logged* days ending at the latest one.
  // An unlogged day breaks the streak — we can't claim intake was low on a day with no data.
  const check = (
    type: Finding["type"],
    key: "protein" | "calories" | "water",
    target: number,
    breached: (v: number) => boolean,
    label: string,
    unit: string,
  ) => {
    const recent = trailingLogged(completed);
    const streak = trailingStreak(recent, (d) => breached(d[key]));
    if (streak < MIN_STREAK) return;
    const window = recent.slice(-streak);
    const average = Math.round(avg(window.map((d) => d[key])) * 10) / 10;
    const deviation = pct(average, target);
    findings.push({
      type,
      severity: streak >= 5 || Math.abs(deviation) >= 30 ? "high" : "warning",
      reason: `${label} has remained ${deviation < 0 ? "below" : "above"} the dietitian-defined target for ${streak} consecutive days.`,
      evidence: {
        metric: key,
        unit,
        target,
        average,
        deviationPercent: deviation,
        consecutiveDays: streak,
        days: series(window, key),
      },
    });
  };

  check("PROTEIN_LOW", "protein", targets.proteinTarget, (v) => v < targets.proteinTarget * 0.85, "Protein intake", "g");
  check("CALORIES_HIGH", "calories", targets.calorieTarget, (v) => v > targets.calorieTarget * 1.15, "Calorie intake", "kcal");
  check("CALORIES_LOW", "calories", targets.calorieTarget, (v) => v < targets.calorieTarget * 0.75, "Calorie intake", "kcal");
  check("WATER_LOW", "water", targets.waterTarget, (v) => v < targets.waterTarget * 0.7, "Water intake", "L");

  const gap = trailingStreak(completed, (d) => d.mealCount === 0);
  if (gap >= MIN_STREAK) {
    findings.push({
      type: "LOGGING_GAP",
      severity: gap >= 5 ? "high" : "warning",
      reason: `No meals have been logged for ${gap} consecutive days.`,
      evidence: { consecutiveDays: gap, lastDays: completed.slice(-gap).map((d) => d.date) },
    });
  }

  return {
    days,
    completedDays: completed.length,
    averages: logged.length
      ? {
          calories: Math.round(avg(logged.map((d) => d.calories))),
          protein: Math.round(avg(logged.map((d) => d.protein)) * 10) / 10,
          water: Math.round(avg(logged.map((d) => d.water)) * 10) / 10,
        }
      : null,
    adherence: adherencePercent(days, targets, joinedDay ?? undefined),
    findings,
  };
}

/** The trailing run of logged days (stops at the first unlogged day from the end). */
function trailingLogged(days: DayTotals[]) {
  const n = trailingStreak(days, (d) => d.mealCount > 0);
  return days.slice(days.length - n);
}
