/**
 * Runs once when the server starts. Loads the local model into memory in the
 * background so the first patient request doesn't pay the cold-start cost.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const base = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
  const model = process.env.OLLAMA_MODEL ?? "llama3.2:3b";
  fetch(`${base}/api/generate`, {
    method: "POST",
    body: JSON.stringify({ model, prompt: "", keep_alive: "30m" }),
  })
    .then((r) => console.log(r.ok ? `[llm] ${model} loaded` : `[llm] ${model} not available (${r.status}) — using template fallback`))
    .catch(() => console.log("[llm] Ollama not reachable — agents will use template fallback"));
}
