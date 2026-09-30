import { test } from "node:test";
import assert from "node:assert/strict";
import { lastNDays } from "../src/lib/dates";
import { describeItems, macrosFor } from "../src/lib/foods";
import { adherencePercent, dayAdherence, type DayTotals } from "../src/lib/progress";

const targets = { calorieTarget: 2000, proteinTarget: 100, waterTarget: 2 };
const day = (date: string, calories: number, protein: number, water: number, mealCount = 3): DayTotals => ({
  date,
  calories,
  protein,
  water,
  mealCount,
});

test("a day exactly on target scores 1", () => {
  assert.equal(dayAdherence(day("2026-01-01", 2000, 100, 2), targets), 1);
});

test("a day with nothing logged scores 0", () => {
  assert.equal(dayAdherence(day("2026-01-01", 0, 0, 0, 0), targets), 0);
});

test("overshooting protein and water is capped; calorie overshoot is penalised", () => {
  // protein 1 (capped), water 1 (capped), calories 1 - 500/2000 = 0.75
  assert.equal(dayAdherence(day("2026-01-01", 2500, 150, 3), targets), (1 + 1 + 0.75) / 3);
});

test("adherence ignores today and days before the patient joined", () => {
  const days = lastNDays(4); // [d-3, d-2, d-1, today]
  const history = [
    day(days[0], 0, 0, 0, 0), // before joining — ignored
    day(days[1], 2000, 100, 2), // 100%
    day(days[2], 2000, 50, 1), // protein 0.5, water 0.5, calories 1 → 66.7%
    day(days[3], 0, 0, 0, 0), // today, in progress — ignored
  ];
  assert.equal(adherencePercent(history, targets, days[1]), Math.round(((1 + 2 / 3) / 2) * 100));
});

test("adherence is unknown until a patient has a completed day", () => {
  const [today] = lastNDays(1);
  assert.equal(adherencePercent([day(today, 800, 40, 1)], targets, today), null);
});

test("macrosFor scales per-100 g values by the amount eaten", () => {
  // rice 130 kcal / 2.7 g protein per 100 g; lentils 116 kcal / 9 g
  assert.deepEqual(macrosFor([{ key: "rice", grams: 200 }, { key: "lentils", grams: 150 }]), {
    calories: 434,
    protein: 18.9,
    carbs: 86,
    fat: 1.2,
  });
});

test("macrosFor and describeItems skip unknown foods and empty amounts", () => {
  const items = [{ key: "rice", grams: 100 }, { key: "unicorn", grams: 50 }, { key: "banana", grams: 0 }];
  assert.equal(macrosFor(items).calories, 130);
  assert.equal(describeItems(items), "Rice (cooked) 100 g");
});
