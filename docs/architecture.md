# Architecture: the multi-agent system

NutriFlow's AI is a **supervisor plus four specialist agents**, orchestrated with LangGraph.js and running on a self-hosted Llama 3.2 3B model (Ollama). The agents inform and coach; **only the dietitian changes a patient's plan.**

```
Frontend → Supervisor ─┬─ Patient Agent      profile, plan, restrictions, recent chat
                       ├─ Nutrition Agent    today's intake vs targets → remaining
                       └─ Monitoring Agent   last 7 completed days → findings
                              ↓ (merge)
                   Coaching Agent (chat only) → Supervisor escalation → dietitian alerts
```

| Component | File | Role |
|---|---|---|
| Supervisor | `src/lib/agents/supervisor.ts` | LangGraph `StateGraph`: classifies the request, fans out **in parallel** to only the agents it needs, merges their output, routes to coaching and/or escalation |
| Patient Agent | `patient-agent.ts` | Loads the dietitian-defined plan, preferences, restrictions and recent conversation |
| Nutrition Agent | `nutrition-agent.ts` | Today's intake vs targets; parses free-text meals into dataset foods |
| Monitoring Agent | `monitoring-agent.ts` | Looks across the last 7 completed days for sustained deviations |
| Coaching Agent | `coaching-agent.ts` | Writes plan-aligned replies from the facts the other agents gathered |

Every agent action is written to `AgentEvent` and shown to the dietitian as an audit trail.

## Request flows

- **Chat message** → Supervisor routes by intent → specialists in parallel → Coaching Agent → reply (+ escalation for safety or plan-change requests).
- **Meal logged** → after the response is sent (`after()`), Supervisor runs Nutrition + Monitoring → new findings become dietitian alerts.
- **"Run agent review now"** (dietitian) → same pipeline on demand.

## What the LLM does — and what it's not trusted with

| Agent | LLM task | Guardrail |
|---|---|---|
| Supervisor | Classifies each chat message into an intent (schema-constrained JSON), which decides which agents run | Fixed rules catch symptoms and plan-change requests first; the LLM can escalate to those but never downgrade them |
| Nutrition Agent | Turns "2 rotis with dal and a glass of milk" into dataset foods + grams | Output constrained to the food list; each item must quote the words it came from; the patient reviews before saving |
| Coaching Agent | Writes the reply from the agents' facts, with a task specific to the intent | Blocked and replaced by a template if it changes targets, gives medical advice, suggests foods outside the diet/restrictions, or quotes a g/kcal/L number that isn't in the facts |
| Supervisor (escalation) | Adds a "what to explore" note to each dietitian alert | The numbers in an alert are always computed, never written by the model |

If the model is unavailable, every agent falls back to deterministic logic built from the same data; chat replies then show "template mode" under **How this answer was made**.

## Monitoring rules

| Finding | Trigger (3+ consecutive logged days) |
|---|---|
| `PROTEIN_LOW` | < 85% of target |
| `CALORIES_HIGH` / `CALORIES_LOW` | > 115% / < 75% of target |
| `WATER_LOW` | < 70% of target |
| `LOGGING_GAP` | no meals logged |

Severity is `high` at 5+ days or ≥ 30% deviation. The same pattern isn't re-raised while an alert is open or within 3 days of a review.

## The end-to-end scenario

1. The owner creates the dietitian's login on the server.
2. Dietitian → **+ Add patient** → goal, calorie/protein/water targets, diet, preferences, restrictions → one-time invitation code.
3. Patient enters the code in the app and sets their own email and password — the only way to create a patient account.
4. Patient logs meals (food picker, free-text description, or manual values) and water.
5. After each meal the Supervisor runs the Nutrition and Monitoring agents in the background.
6. The Monitoring Agent detects a sustained deviation, e.g. protein averaging 74 g vs 120 g (−38%) for 7 days.
7. The Supervisor raises an alert with the evidence — *"AI did not modify the patient's plan."*
8. The dietitian decides: **Keep current plan / Modify plan / Message patient**.
9. The patient asks "What should I do about my protein today?" and gets coaching within the plan.

## Data model

`prisma/schema.prisma`: users (dietitians and patients), dietitian ↔ patient links with invitation codes, profiles, nutrition targets, meals, daily progress, agent events, alerts, chat messages and sessions. SQLite via Prisma 7 with the libsql driver adapter.
