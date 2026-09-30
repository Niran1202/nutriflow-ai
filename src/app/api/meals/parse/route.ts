import { apiUser, badRequest, unauthorized } from "@/lib/auth";
import { parseMealText } from "@/lib/agents/nutrition-agent";
import { logAgentEvent } from "@/lib/agents/events";

/** Nutrition Agent: parse a free-text meal description into dataset foods (not saved). */
export async function POST(req: Request) {
  const me = await apiUser("PATIENT");
  if (!me) return unauthorized();
  const { text } = await req.json();
  const description = String(text ?? "").trim();
  if (!description) return badRequest("Describe what you ate");
  if (description.length > 500) return badRequest("Description is too long");

  const parsed = await parseMealText(description);
  await logAgentEvent(me.id, "Nutrition Agent", "parse_meal", { text: description, ...parsed });
  return Response.json(parsed);
}
