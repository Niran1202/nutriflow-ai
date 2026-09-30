# NutriFlow AI

[![CI](https://github.com/Niran1202/nutriflow-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/Niran1202/nutriflow-ai/actions/workflows/ci.yml)

**A dietitian-controlled nutrition coaching platform with a private, self-hosted multi-agent AI.** Patients log meals and chat with an AI assistant; a team of agents monitors their progress, coaches them within the plan their dietitian set, and flags concerning patterns for the dietitian to review. **The AI never changes a patient's plan.**

Next.js · TypeScript · LangGraph.js · Ollama (Llama 3.2 3B) · Prisma · SQLite · Electron · Oracle Cloud

## Highlights

- **Multi-agent AI with LangGraph.js** — a supervisor routes each request to Patient, Nutrition and Monitoring agents in parallel, then to a Coaching agent; every action is recorded in an audit trail.
- **Self-hosted LLM, no AI API bills** — Llama 3.2 runs on the server through Ollama, with schema-constrained JSON for intent routing and for parsing "2 rotis with dal" into nutrition data.
- **Safety guardrails** — symptoms and plan-change requests always go to the dietitian; AI replies are checked for invented numbers, diet conflicts and medical advice before a patient sees them.
- **Human in the loop** — sustained deviations (e.g. protein 38% under target for 7 days) become evidence-backed alerts; the dietitian decides to keep the plan, modify it, or message the patient.
- **Oracle Cloud deployment** — one command deploys to an Always Free Ampere VM with Caddy HTTPS, systemd and a locked-down firewall.
- **Windows desktop app** — an Electron client that contains no data or accounts, only the server address.

## How it works

```
 Dietitian ─┐                                   ┌──────────── Oracle Cloud VM ────────────┐
 Patient  ──┼── desktop app / browser ── HTTPS ─┤ Caddy → NutriFlow (Next.js) → Ollama    │
 Patient  ──┘                                   │         SQLite   · LangGraph agents       │
                                                └──────────────────────────────────────────┘
```

- **The server** runs on one Oracle Cloud VM: the app, the database and the AI model. Prompts and patient data never go to a third-party AI service.
- **Dietitian accounts are issued by the owner** from the command line — there is no sign-up page.
- **Patients** join with a one-time invitation code from their dietitian.
- **Logins and invitation codes are rate-limited**, cookies are `Secure`/`HttpOnly`, and only ports 80/443 are open.

More detail: [Architecture of the agents](docs/architecture.md) · [Oracle Cloud deployment guide](docs/oracle-cloud.md)

## Deploy to Oracle Cloud

1. Create an Always Free **Ubuntu 24.04** VM on the Ampere `VM.Standard.A1.Flex` shape (4 OCPU, 24 GB), add your SSH key, and allow TCP **80** and **443** in its security list.
2. From this repository on your PC:

   ```bash
   bash deploy/oracle/deploy.sh <public-ip>
   ```

   It installs Node.js, Ollama + Llama 3.2, Caddy (automatic HTTPS), the firewall rules and a systemd service, builds the app, and checks it's reachable at `https://<ip-with-dashes>.sslip.io` (or pass `--domain your.domain`).
3. Create a dietitian login — the password is generated and printed once:

   ```bash
   bash deploy/oracle/manage.sh <public-ip> dietitian --name "Full Name" --email someone@example.com
   ```

4. Build the desktop app for that address (see below).

Day-to-day: `manage.sh <ip> status | logs | restart | list | backup`. The full walkthrough is in [docs/oracle-cloud.md](docs/oracle-cloud.md).

## Desktop app (Windows)

```bash
cd desktop
npm install
npm run dist -- --server https://<ip-with-dashes>.sslip.io
```

This produces `download/NutriFlow-AI-Setup-<version>.exe` (installer) and `download/NutriFlow-AI-Portable-<version>.exe`. They contain only the server address — no accounts or patient data — so they're safe to share. If the server can't be reached the app offers **Try again / Change server address**. The installer isn't code-signed, so Windows SmartScreen may show a warning (**More info → Run anyway**).

## Local development

Requires Node.js 22. [Ollama](https://ollama.com/download) is optional — without it the agents use deterministic fallback replies.

```bash
npm install
npm run setup               # local nutriflow.db with demo data
npm run dev                 # http://localhost:3000
ollama pull llama3.2:3b     # optional: real AI replies
```

Demo accounts exist **only in this local database**, never on a deployed server:

| Account | Role | State |
|---|---|---|
| `demo@nutriflow.local` / `demo1234` | Dietitian | 3 patients |
| `max@nutriflow.local` / `demo1234` | Patient | 7 days of low protein → open alert |
| `anna@nutriflow.local` / `demo1234` | Patient | Stable |
| invitation code `NF-7QJM-4T` | Jonas Klein | Not joined yet — try joining with it |

| Command | What it does |
|---|---|
| `npm test` | Unit tests: guardrails, intent routing, adherence scoring |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run agents:check` | Runs the real agent pipeline against the local model and prints each step |
| `npm run db:seed` | Resets the demo data |

## Project layout

```
src/lib/agents/        supervisor + patient / nutrition / monitoring / coaching agents
src/lib/llm.ts         Ollama client: free text + schema-constrained JSON, with fallback
src/app/               Next.js pages and API routes (dietitian, patient, auth, chat, meals, alerts)
prisma/                schema, migrations, demo seed
scripts/server.ts      server-side owner tools (database setup, dietitian accounts, start)
deploy/oracle/         deploy.sh, manage.sh, setup.sh, Caddy and systemd config
desktop/               Electron desktop app (thin client)
tests/                 node:test unit tests
docs/                  architecture and deployment guides
```

## Not in scope (on purpose)

Payments, photo recognition, wearables, mobile apps, external nutrition APIs, automatic plan changes, diagnosis.

## Safety and privacy

NutriFlow is a software project, not a medical device or a substitute for professional care. AI output can be wrong and must be reviewed by a qualified dietitian. Do not use it to diagnose or treat medical conditions. A deployment stores sensitive health-related information: keep the server patched, restrict access, and take regular backups (`manage.sh <ip> backup`). Self-hosting the model keeps prompts away from AI providers, but does not by itself make a deployment compliant with any particular health-data law.
