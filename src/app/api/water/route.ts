import { apiUser, badRequest, unauthorized } from "@/lib/auth";
import { addWater } from "@/lib/progress";

export async function POST(req: Request) {
  const me = await apiUser("PATIENT");
  if (!me) return unauthorized();
  const { litres } = await req.json();
  const amount = Number(litres);
  if (!amount || Math.abs(amount) > 3) return badRequest("Enter an amount between -3 and 3 litres");
  const water = await addWater(me.id, amount);
  return Response.json({ water });
}
