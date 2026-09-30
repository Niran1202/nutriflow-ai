/**
 * Smoke test for the agents against the local model (run after `npm run setup`).
 * Usage: npm run agents:check
 * Note: it runs the real pipeline, so safety / plan-change messages create
 * alerts on the demo patient. Run `npm run db:seed` afterwards to reset.
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { llmAvailable, MODEL } from "../src/lib/llm";
import { runSupervisor } from "../src/lib/agents/supervisor";
import { parseMealText } from "../src/lib/agents/nutrition-agent";

(async () => {
  console.log(`Model ${MODEL}: ${(await llmAvailable()) ? "available" : "NOT available — template fallback"}`);
  const max = await prisma.user.findFirstOrThrow({ where: { name: "Max Weber" } });
  const msgs = [
    "What should I do about my protein today?",
    "I haven't been able to follow my plan this week.",
    "hey there!",
    "any ideas for a light dinner?",
    "my heart keeps racing after coffee",
    "can I have a cheat day on sunday?",
  ];
  for (const m of msgs) {
    const t = Date.now();
    const r = await runSupervisor({ patientId: max.id, trigger: "chat", message: m });
    console.log(`\n>>> ${m}  [${r.intent}, ${((Date.now() - t) / 1000).toFixed(1)}s]`);
    console.log(r.reply);
    for (const s of r.trace) console.log(`   · ${s.agent}: ${s.summary}`);
  }
  for (const d of [
    "2 rotis with a bowl of dal and some palak paneer",
    "oats with milk and a banana, handful of almonds",
    "chickpea salad with feta and cucumber, then greek yogurt with berries",
    "pizza and a coke",
  ]) {
    const t = Date.now();
    const parsed = await parseMealText(d);
    console.log(`\n### ${d}  [${((Date.now() - t) / 1000).toFixed(1)}s]`, JSON.stringify(parsed));
  }
  await prisma.$disconnect();
})();
