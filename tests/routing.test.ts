import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyIntent } from "../src/lib/agents/supervisor";

// These rules run before the LLM. Safety and plan-change matches can't be
// overridden by the model, so they must catch the obvious cases on their own.
const cases: [string, ReturnType<typeof classifyIntent>][] = [
  ["I feel dizzy after lunch", "safety"],
  ["Is it ok with my blood sugar medication?", "safety"],
  ["Can you increase my calorie target?", "plan_change"],
  ["I want a new plan", "plan_change"],
  ["I haven't been able to follow my plan this week.", "struggling"],
  ["How am I doing this week?", "progress"],
  ["What should I do about my protein today?", "protein"],
  ["How much water do I have left?", "water"],
  ["How many kcal can I still have?", "calories"],
  ["Any ideas for dinner?", "meal_idea"],
  ["hello!", "general"],
];

for (const [message, intent] of cases) {
  test(`"${message}" → ${intent}`, () => {
    assert.equal(classifyIntent(message), intent);
  });
}

test("safety wins over other topics in the same message", () => {
  assert.equal(classifyIntent("I get chest pain when I eat more protein"), "safety");
});
