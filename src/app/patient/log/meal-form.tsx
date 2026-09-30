"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "@/lib/client";
import { FOODS, macrosFor, type FoodItem } from "@/lib/foods";
import { FormError } from "@/components/auth-shell";

const MEAL_TYPES = ["Breakfast", "Lunch", "Dinner", "Snack"];

function defaultMealType() {
  const h = new Date().getHours();
  if (h < 11) return "Breakfast";
  if (h < 16) return "Lunch";
  if (h < 21) return "Dinner";
  return "Snack";
}

const FOOD_OPTIONS = Object.entries(FOODS).sort((a, b) => a[1].name.localeCompare(b[1].name));

export function MealForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"describe" | "foods" | "manual">("describe");
  const [description, setDescription] = useState("");
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [mealType, setMealType] = useState(defaultMealType);
  const [items, setItems] = useState<FoodItem[]>([]);
  const [pick, setPick] = useState(FOOD_OPTIONS[0][0]);
  const [grams, setGrams] = useState("150");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const totals = useMemo(() => macrosFor(items), [items]);

  async function submit(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await api("/api/meals", "POST", { mealType, ...body });
      router.push("/patient");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function understand() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ items: FoodItem[]; unmatched: string[]; usedLLM: boolean }>("/api/meals/parse", "POST", { text: description });
      if (!r.items.length) {
        setError(
          r.unmatched.length
            ? `${r.unmatched.join(", ")} ${r.unmatched.length > 1 ? "aren't" : "isn't"} in the food list yet — use "Enter manually" instead.`
            : "Couldn't match that to foods in the list — try the food picker instead.",
        );
        return;
      }
      setItems(r.items);
      setAiNote(
        (r.usedLLM ? "The Nutrition Agent filled this in — check the amounts before saving." : "Matched by keyword (AI model offline) — amounts default to 100 g, please adjust.") +
          (r.unmatched.length ? ` Not in the food list: ${r.unmatched.join(", ")}.` : ""),
      );
      setMode("foods");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mt-6 space-y-5">
      <div>
        <span className="label">Meal</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Meal type">
          {MEAL_TYPES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mealType === m}
              onClick={() => setMealType(m)}
              className={mealType === m ? "btn-primary" : "btn-secondary"}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-4 border-b border-line text-sm">
        {(["describe", "foods", "manual"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`-mb-px border-b-2 pb-2 ${mode === m ? "border-brand font-medium text-ink" : "border-transparent text-muted"}`}
          >
            {{ describe: "Describe it", foods: "Choose foods", manual: "Enter manually" }[m]}
          </button>
        ))}
      </div>

      {mode === "describe" ? (
        <div className="space-y-3">
          <label className="label" htmlFor="describe">What did you eat?</label>
          <textarea
            id="describe"
            rows={3}
            className="input"
            placeholder="2 rotis with a bowl of dal, some palak paneer and a glass of milk"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
          />
          <FormError message={error} />
          <button className="btn-primary w-full" disabled={busy || !description.trim()} onClick={understand}>
            {busy ? "Nutrition Agent is reading your meal…" : "Work out the nutrition"}
          </button>
          <p className="text-xs text-muted">The local AI matches your words to the food list and estimates portions. You can check and edit everything before saving.</p>
        </div>
      ) : mode === "foods" ? (
        <div className="space-y-4">
          {aiNote && <p className="rounded-lg bg-brand-soft px-3 py-2 text-sm">{aiNote}</p>}
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-48 flex-1">
              <label className="label" htmlFor="food">Food</label>
              <select id="food" className="input" value={pick} onChange={(e) => setPick(e.target.value)}>
                {FOOD_OPTIONS.map(([key, f]) => (
                  <option key={key} value={key}>{f.name}</option>
                ))}
              </select>
            </div>
            <div className="w-28">
              <label className="label" htmlFor="grams">Amount (g)</label>
              <input id="grams" type="number" min={1} max={2000} className="input" value={grams} onChange={(e) => setGrams(e.target.value)} />
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                const g = Number(grams);
                if (g > 0) setItems((xs) => [...xs, { key: pick, grams: g }]);
              }}
            >
              Add
            </button>
          </div>
          <p className="text-xs text-muted">
            {FOODS[pick].name}: {FOODS[pick].calories} kcal, {FOODS[pick].protein} g protein per 100 g
          </p>

          {items.length > 0 && (
            <ul className="divide-y divide-line rounded-lg border border-line text-sm">
              {items.map((it, i) => {
                const m = macrosFor([it]);
                return (
                  <li key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="flex items-center gap-2">
                      {FOODS[it.key].name}
                      <input
                        type="number"
                        min={1}
                        max={2000}
                        aria-label={`${FOODS[it.key].name} grams`}
                        className="w-20 rounded-md border border-line px-2 py-0.5 text-sm tabular-nums"
                        value={it.grams}
                        onChange={(e) => {
                          const g = Math.max(0, Number(e.target.value) || 0);
                          setItems((xs) => xs.map((x, j) => (j === i ? { ...x, grams: g } : x)));
                        }}
                      />
                      <span className="text-muted">g</span>
                    </span>
                    <span className="flex items-center gap-3 tabular-nums text-muted">
                      {m.calories} kcal · {m.protein} g
                      <button type="button" aria-label="Remove" className="hover:text-danger" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}>✕</button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <dl className="grid grid-cols-4 gap-2 rounded-lg bg-canvas p-3 text-center text-sm tabular-nums">
            <div><dt className="eyebrow">kcal</dt><dd className="font-semibold">{totals.calories}</dd></div>
            <div><dt className="eyebrow">Protein</dt><dd className="font-semibold">{totals.protein} g</dd></div>
            <div><dt className="eyebrow">Carbs</dt><dd className="font-semibold">{totals.carbs} g</dd></div>
            <div><dt className="eyebrow">Fat</dt><dd className="font-semibold">{totals.fat} g</dd></div>
          </dl>
          <FormError message={error} />
          <button className="btn-primary w-full" disabled={busy || items.length === 0} onClick={() => submit({ items })}>
            {busy ? "Saving…" : `Save ${mealType.toLowerCase()}`}
          </button>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit(Object.fromEntries(new FormData(e.currentTarget)));
          }}
        >
          <div>
            <label className="label" htmlFor="m-food">Food</label>
            <input id="m-food" name="food" required className="input" placeholder="Rice, lentils, vegetables" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["calories", "Calories (kcal)"],
              ["protein", "Protein (g)"],
              ["carbs", "Carbs (g)"],
              ["fat", "Fat (g)"],
            ].map(([name, label]) => (
              <div key={name}>
                <label className="label" htmlFor={`m-${name}`}>{label}</label>
                <input id={`m-${name}`} name={name} type="number" min={0} step="0.1" required className="input" />
              </div>
            ))}
          </div>
          <FormError message={error} />
          <button className="btn-primary w-full" disabled={busy}>{busy ? "Saving…" : `Save ${mealType.toLowerCase()}`}</button>
        </form>
      )}
    </div>
  );
}
