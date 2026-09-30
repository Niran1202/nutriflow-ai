import { test } from "node:test";
import assert from "node:assert/strict";
import { checkReply } from "../src/lib/agents/coaching-agent";
import type { PatientContext } from "../src/lib/agents/types";
import { dietConflicts, proteinSuggestions } from "../src/lib/foods";

const patient: PatientContext = {
  patientId: "p1",
  name: "Max Weber",
  firstName: "Max",
  goal: "Weight management",
  dietType: "Vegetarian",
  preferences: "Indian / Mediterranean",
  restrictions: "None",
  targets: { calorieTarget: 2200, proteinTarget: 120, waterTarget: 2.5 },
  joinedDay: null,
  recentConversation: [],
};

const facts = [
  "- Daily targets set by the dietitian: 2200 kcal, 120 g protein, 2.5 L water.",
  "- Still needed today: 1139 kcal; 75 g protein; 0.7 L water.",
  "- Plan-compatible foods (protein per 100 g): Paneer 18.3 g; Greek yogurt 10 g.",
].join("\n");

test("dietConflicts flags meat and fish for a vegetarian plan", () => {
  assert.deepEqual(dietConflicts("Try grilled chicken or salmon tonight", "Vegetarian", "None"), ["chicken", "salmon"]);
});

test("dietConflicts flags dairy and eggs for a vegan plan", () => {
  assert.deepEqual(dietConflicts("Greek yogurt with an egg", "Vegan", "None").sort(), ["egg", "yogurt"]);
});

test("dietConflicts applies restrictions even when the diet allows the food", () => {
  assert.deepEqual(dietConflicts("Add some paneer to lunch", "Omnivore", "Lactose intolerance"), ["paneer"]);
});

test("dietConflicts allows plan-compatible foods", () => {
  assert.deepEqual(dietConflicts("Dal with rice and spinach", "Vegetarian", "None"), []);
});

test("proteinSuggestions respect diet type and restrictions", () => {
  const vegan = proteinSuggestions("Vegan", "Soy allergy", "", 10);
  assert.ok(vegan.length > 0);
  for (const f of vegan) {
    assert.ok(f.tags.includes("vegan"), `${f.name} is not vegan`);
    assert.doesNotMatch(f.name, /tofu|tempeh|edamame|soy/i);
  }
});

test("checkReply accepts a grounded, plan-aligned reply", () => {
  assert.equal(checkReply("Max, you still need 75 g of protein today. Paneer (18.3 g per 100 g) works well.", patient, facts), null);
});

test("checkReply blocks attempts to change the plan", () => {
  assert.equal(checkReply("Let's increase your protein target to 150 g.", patient, facts), "tried to change the plan");
});

test("checkReply blocks numbers the agents never provided", () => {
  assert.match(checkReply("A cup of soy chunks has about 26g protein.", patient, facts) ?? "", /unverified numbers: 26g/);
});

test("checkReply blocks medical advice", () => {
  assert.equal(checkReply("You might have an iron deficiency.", patient, facts), "medical advice");
});

test("checkReply blocks foods outside the diet", () => {
  assert.match(checkReply("Have some tuna for dinner.", patient, facts) ?? "", /suggested tuna/);
});
