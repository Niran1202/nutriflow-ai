import { ChatOllama } from "@langchain/ollama";
import { HumanMessage, SystemMessage, AIMessage, type BaseMessage } from "@langchain/core/messages";

const BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
export const MODEL = process.env.OLLAMA_MODEL ?? "llama3.2:3b";

let cached: { ok: boolean; at: number } | null = null;

/** True when Ollama is reachable and the configured model is pulled. Cached for 30 s. */
export async function llmAvailable(): Promise<boolean> {
  if (cached && Date.now() - cached.at < 30_000) return cached.ok;
  let ok = false;
  try {
    const res = await fetch(`${BASE_URL}/api/tags`, { signal: AbortSignal.timeout(1500) });
    if (res.ok) {
      const data = (await res.json()) as { models?: { name: string }[] };
      const want = MODEL.includes(":") ? MODEL : `${MODEL}:latest`;
      ok = !!data.models?.some((m) => m.name === want || m.name === MODEL);
    }
  } catch {
    ok = false;
  }
  cached = { ok, at: Date.now() };
  return ok;
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

function toMessages(system: string, prompt: string, history: ChatTurn[]): BaseMessage[] {
  return [
    new SystemMessage(system),
    ...history.map((h) => (h.role === "user" ? new HumanMessage(h.content) : new AIMessage(h.content))),
    new HumanMessage(prompt),
  ];
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c) => (c && typeof c === "object" && "text" in c ? String(c.text) : "")).join("");
  return "";
}

function fail(where: string, err: unknown) {
  console.error(`[llm] ${where} failed:`, (err as Error).message);
  // A timeout usually means the model is still loading; don't mark Ollama as down for it.
  if ((err as Error).name !== "TimeoutError") cached = { ok: false, at: Date.now() };
}

/**
 * Free-text answer from the local model. Returns null when the model is
 * unavailable or errors, so every caller must have a deterministic fallback.
 */
export async function askLLM(system: string, prompt: string, history: ChatTurn[] = []): Promise<string | null> {
  if (!(await llmAvailable())) return null;
  try {
    const model = new ChatOllama({ baseUrl: BASE_URL, model: MODEL, temperature: 0.3, numPredict: 350, keepAlive: "30m" });
    const res = await model.invoke(toMessages(system, prompt, history), { signal: AbortSignal.timeout(120_000) });
    return textOf(res.content).trim() || null;
  } catch (err) {
    fail("askLLM", err);
    return null;
  }
}

/**
 * Structured answer: Ollama constrains decoding to `schema` (JSON Schema), so
 * the model can only emit JSON of that shape. `validate` still checks the
 * values before anything is trusted. Returns null on any failure.
 */
export async function askJSON<T>(
  system: string,
  prompt: string,
  schema: Record<string, unknown>,
  validate: (v: unknown) => T | null,
  maxTokens = 400,
): Promise<T | null> {
  if (!(await llmAvailable())) return null;
  try {
    const model = new ChatOllama({ baseUrl: BASE_URL, model: MODEL, temperature: 0, numPredict: maxTokens, format: schema, keepAlive: "30m" });
    const res = await model.invoke(toMessages(system, prompt, []), { signal: AbortSignal.timeout(120_000) });
    return validate(JSON.parse(textOf(res.content)));
  } catch (err) {
    fail("askJSON", err);
    return null;
  }
}
