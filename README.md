# NutriFlow AI

A local-first, dietitian-controlled nutrition platform. Local AI agents monitor patients' food logs and progress, give plan-aligned coaching, and flag cases for dietitian review. **The AI never changes a patient's plan.**

Next.js + TypeScript · SQLite (Prisma 7 + libsql) · LangGraph.js · Ollama. Run the server on a machine you control and use a local model; no hosted AI service or API key is required.

## Requirements

- Node.js 22 and npm
- Ollama for local-model responses (optional; deterministic fallback responses work without it)
- Windows 10 or later to build the Electron desktop app
- Ubuntu for the Oracle Cloud deployment scripts

Copy `.env.example` to `.env` when you need to customize the database or Ollama settings. Keep `.env` private; it is ignored by Git.

## How it's deployed

```
 Dietitian's PC ─┐                                  ┌─ Owner's PC (the NutriFlow server)
 Patient's PC  ──┼── NutriFlow desktop app ── https ─┤    Next.js server · SQLite (server-data/) · Ollama
 Patient's PC  ─┘      (window only, no data)        └─   exposed by a Cloudflare tunnel
```

- **The owner's PC** runs the server, the database and the AI model. Nothing is sent to cloud AI services.
- **The desktop app** is built from `desktop/` and is just a window onto the server. It contains no patient data or accounts — only the server address.
- **Dietitian accounts are created only by the owner**, on the server PC. There is no sign-up page.
- **Patients** install the app and join with the invitation code their dietitian gives them.

## Running the live server (owner)

```bash
npm install
npm run server:setup                                    # create the live database (server-data/nutriflow.db)
npm run server:dietitian -- --name "Full Name" --email someone@example.com
                                                        # prints a generated password — share it privately
npm run server:start                                    # terminal 1: the server (127.0.0.1:3000)
npm run server:tunnel                                   # terminal 2: public https:// address
```

- Add `--password "…"` to choose the password yourself. Running `server:dietitian` again for an existing email **resets the password** and signs that dietitian out everywhere.
- `npm run server:list` shows all dietitians and how many patients each has.
- Both terminals must stay open, and the PC must stay on, for people to use NutriFlow. Start Ollama too for AI replies.
- Security: the server only listens on 127.0.0.1 (the tunnel is the only way in), cookies are `Secure` over HTTPS, and login / invitation attempts are rate-limited.

**The tunnel address changes every time `server:tunnel` restarts.** Users can then enter the new address under **File → Server address…** in the app, or you rebuild the app with it (below). For an address that never changes, use a Cloudflare named tunnel with your own domain, or a free static ngrok domain.

## Desktop app

The Electron app is a thin client that stores the server address, not patient data. Its source is in `desktop/`. Build the Windows installer and portable executable locally:

```bash
cd desktop
npm install
npm run dist -- --server https://your-address
```

The build places shareable installers in the root `download/` directory. Build outputs are intentionally excluded from this repository. The app opens the server address it was built with; if it can't be reached, the app offers **Try again / Change server address**. The installer is not code-signed, so Windows SmartScreen may show a warning.

To rebuild after the server address changes, rerun `npm run dist -- --server https://new-address` from `desktop/`. Omit `--server` to use the current tunnel address.

## Oracle Cloud deployment

The repository includes scripts for deploying to an Ubuntu Oracle Cloud VM with Caddy-managed HTTPS. From the project root, run `bash deploy/oracle/deploy.sh <public-ip>`; optionally pass `--domain your.domain`. The script uses `~/.ssh/nutriflow_oracle` by default, configurable with `NUTRIFLOW_SSH_KEY` and `NUTRIFLOW_SSH_USER`. Review the deployment scripts and firewall/network configuration for your environment before running them.

## Local development (demo data)

```bash
npm run setup      # nutriflow.db with demo data (separate from the live server's database)
npm run dev        # http://localhost:3000
```

Demo accounts exist **only in this local development database**, never on the live server:

| Account | Role | State |
|---|---|---|
| `demo@nutriflow.local` / `demo1234` | Dietitian | 3 patients |
| `max@nutriflow.local` / `demo1234` | Patient | 7 days of low protein → open alert |
| `anna@nutriflow.local` / `demo1234` | Patient | Stable |
| code `NF-7QJM-4T` | Jonas Klein | Invitation not used yet — try joining with it |

`npm run db:seed` resets the demo data at any time.

### Local LLM

```bash
ollama pull llama3.2:3b     # ~2 GB; runs on a 4 GB GPU. Set OLLAMA_MODEL in .env to use another model
npm run agents:check        # runs the real agent pipeline against the model and prints each step
```

The model is loaded into memory when the server starts (`src/instrumentation.ts`). Warm response times on a GTX 1650: chat 5–9 s, meal parsing ~4 s.

If Ollama isn't running or the model isn't pulled, every agent falls back to deterministic logic built from the same data, so the demo still works. Chat replies show "template mode" under **How this answer was made** when this happens.

### What the LLM does (and what it's not trusted with)

| Agent | LLM task | Guardrail |
|---|---|---|
| Supervisor | Classifies each chat message into an intent (schema-constrained JSON) and so decides which agents run | Fixed rules catch symptoms and plan-change requests first; the LLM can escalate to those but never downgrade them |
| Nutrition Agent | Turns "2 rotis with dal and a glass of milk" into dataset foods + grams | Output constrained to the food list; each item must quote the words it came from; the patient reviews before saving |
| Coaching Agent | Writes the reply from the facts the other agents gathered, with a task specific to the intent | Reply is blocked and replaced by a template if it changes targets, gives medical advice, suggests foods outside the diet/restrictions, or quotes a g/kcal/L number that isn't in the facts |
| Supervisor (escalation) | Adds a "what to explore" suggestion to each dietitian alert | The numbers in the alert are always computed, never written by the model |

## The end-to-end scenario

1. Dietitian logs in with the account the owner created → **+ Add patient** → sets goal, calorie/protein/water targets, diet, preferences, restrictions → gets an invitation code.
2. Patient enters the code on the start page → sets their own email/password. There is no other way to create a patient account.
3. Patient logs meals (from the local `foods.json` dataset or manually) and water.
4. After each meal, the **Supervisor** runs the Nutrition and Monitoring agents in the background.
5. The **Monitoring Agent** detects a sustained deviation (e.g. protein < 85% of target for 3+ consecutive logged days).
6. The Supervisor writes an explanation and raises an alert: *"Protein intake has remained below the dietitian-defined target for 7 consecutive days — average 74 g vs 120 g (−38%). AI did not modify the patient's plan."*
7. Dietitian reviews: **Keep current plan / Modify plan / Message patient**.
8. Patient asks the assistant "What should I do about my protein today?" and gets plan-aligned coaching.

## Agents

```
Frontend → Supervisor ─┬─ Patient Agent      profile, plan, restrictions, recent chat
                       ├─ Nutrition Agent    today's intake vs targets → remaining
                       └─ Monitoring Agent   last 7 completed days → findings
                              ↓ (merge)
                   Coaching Agent (chat only) → Supervisor escalation → dietitian alerts
```

- **Supervisor** (`src/lib/agents/supervisor.ts`) is a LangGraph `StateGraph`. It classifies the request, fans out to only the agents that request needs (in parallel), merges their outputs, then routes to coaching and/or escalation.
- Intent routing is two-stage: fixed rules catch safety-relevant messages (symptoms, requests to change the plan), then the local LLM classifies everything else. Safety and plan-change requests get fixed replies and are always passed to the dietitian.
- Every agent action is written to `AgentEvent` and shown to the dietitian as an audit trail.
- Alerts are de-duplicated: the same pattern isn't re-raised while one is open or within 3 days of a review.

| Monitoring rule | Threshold (3+ consecutive days) |
|---|---|
| `PROTEIN_LOW` | < 85% of target |
| `CALORIES_HIGH` / `CALORIES_LOW` | > 115% / < 75% of target |
| `WATER_LOW` | < 70% of target |
| `LOGGING_GAP` | no meals logged |

Severity is `high` at 5+ days or ≥ 30% deviation.

## Project layout

```
prisma/schema.prisma        data model (users, dietitian_patient, profiles, targets, meals,
                            daily_progress, agent_events, alerts, chat messages, sessions)
prisma/seed.ts              demo data + initial agent run
src/data/foods.json         local nutrition dataset (per 100 g)
src/lib/agents/             supervisor + patient / nutrition / monitoring / coaching agents
src/lib/llm.ts              Ollama wrapper: free text + schema-constrained JSON, with fallback
src/instrumentation.ts      warms the model when the server starts
scripts/agents-check.ts     runs the agent pipeline against the local model
src/lib/progress.ts         daily totals and adherence scoring
src/app/api/                route handlers (auth, patients, meals, water, chat, alerts)
src/app/dietitian/          dietitian dashboard, create patient, patient review
scripts/server.ts           owner tools: live database, dietitian accounts, server, tunnel
desktop/                    Electron desktop app (thin client) → download/
src/app/patient/            patient dashboard, meal logging, AI assistant
```

## Not in the MVP (on purpose)

Payments, managed cloud hosting, photo recognition, wearables, mobile apps, external nutrition APIs, automatic plan changes, diagnosis.

## Safety and privacy

NutriFlow is a software project, not a medical device or a substitute for professional care. AI output can be wrong and must be reviewed by a qualified dietitian. Do not use it to diagnose or treat medical conditions. Deployments may store sensitive nutrition and health-related information; secure the host, restrict access, and maintain protected backups before using real patient data. The local-model setup avoids sending prompts to a hosted AI provider, but does not by itself make a deployment compliant with any particular privacy or health-data law.
