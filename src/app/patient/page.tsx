import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { greeting, today } from "@/lib/dates";
import { runNutritionAgent } from "@/lib/agents/nutrition-agent";
import { AppHeader, ProgressBar } from "@/components/ui";
import { Chat, type ChatItem } from "./chat";
import { WaterButtons, DeleteMealButton } from "./patient-controls";

const MAIN_MEALS = ["Breakfast", "Lunch", "Dinner"];

export default async function PatientDashboard() {
  const me = await requireRole("PATIENT");
  const date = today();

  const [user, meals, nutrition, messages] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: me.id },
      include: { profile: true, target: true, dietitianLink: { include: { dietitian: true } } },
    }),
    prisma.meal.findMany({ where: { patientId: me.id, date }, orderBy: { createdAt: "asc" } }),
    runNutritionAgent(me.id, date),
    prisma.chatMessage.findMany({ where: { patientId: me.id }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  const t = user.target!;
  const profile = user.profile!;
  const r = nutrition.remaining;

  const tip =
    r.protein > 0
      ? `You have about ${Math.round(r.protein)} g of your protein target remaining today.`
      : r.water > 0
        ? `Protein target reached — about ${r.water} L of water left to go today.`
        : "You've hit your protein and water targets today. Nice work!";

  const chatItems: ChatItem[] = messages.reverse().map((m) => {
    const meta = m.meta ? JSON.parse(m.meta) : null;
    return { id: m.id, role: m.role as ChatItem["role"], content: m.content, trace: meta?.trace, usedLLM: meta?.usedLLM };
  });

  return (
    <>
      <AppHeader name={me.name} role="PATIENT" />
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-semibold">{greeting()}, {me.name.split(" ")[0]} 👋</h1>
        <p className="text-sm text-muted">Your plan from {user.dietitianLink?.dietitian.name ?? "your dietitian"}: {profile.goal} · {profile.dietType}</p>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="space-y-6">
            <section className="card">
              <h2 className="text-lg font-semibold">Today&apos;s progress</h2>
              <div className="mt-4 space-y-5">
                <ProgressBar label="Calories" value={nutrition.consumed.calories} target={t.calorieTarget} unit="kcal" />
                <ProgressBar label="Protein" value={nutrition.consumed.protein} target={t.proteinTarget} unit="g" />
                <div>
                  <ProgressBar label="Water" value={nutrition.consumed.water} target={t.waterTarget} unit="L" decimals={1} />
                  <WaterButtons />
                </div>
              </div>
            </section>

            <section className="card">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Today&apos;s meals</h2>
                <Link href="/patient/log" className="btn-primary">+ Log meal</Link>
              </div>
              <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                {MAIN_MEALS.map((m) => {
                  const done = nutrition.mealsLogged.includes(m);
                  return (
                    <li key={m} className={done ? "font-medium text-brand-strong" : "text-muted"}>
                      {done ? "✓" : "○"} {m}
                    </li>
                  );
                })}
              </ul>
              {meals.length > 0 && (
                <ul className="mt-4 divide-y divide-line border-t border-line text-sm">
                  {meals.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <div className="font-medium">{m.mealType}</div>
                        <div className="truncate text-muted">{m.food}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="text-right tabular-nums text-muted">{Math.round(m.calories)} kcal · {m.protein} g</span>
                        <DeleteMealButton id={m.id} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card">
              <h2 className="text-lg font-semibold">Your goals</h2>
              <p className="text-xs text-muted">Set by your dietitian. Ask them if you think something should change.</p>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <div><dt className="eyebrow">Goal</dt><dd>{profile.goal}</dd></div>
                <div><dt className="eyebrow">Calories</dt><dd>{t.calorieTarget} kcal / day</dd></div>
                <div><dt className="eyebrow">Protein</dt><dd>{t.proteinTarget} g / day</dd></div>
                <div><dt className="eyebrow">Water</dt><dd>{t.waterTarget} L / day</dd></div>
                <div><dt className="eyebrow">Diet</dt><dd>{profile.dietType}</dd></div>
                <div><dt className="eyebrow">Restrictions</dt><dd>{profile.restrictions}</dd></div>
              </dl>
            </section>
          </div>

          <section className="card flex h-fit flex-col lg:sticky lg:top-6">
            <h2 className="text-lg font-semibold">AI assistant</h2>
            <p className="mt-2 rounded-lg bg-brand-soft px-3 py-2 text-sm">&ldquo;{tip}&rdquo;</p>
            <Chat initial={chatItems} />
          </section>
        </div>
      </main>
    </>
  );
}
