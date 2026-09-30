/** Shared plan inputs used when creating a patient and when modifying their plan. */
export type PlanValues = {
  goal: string;
  calorieTarget: number | string;
  proteinTarget: number | string;
  waterTarget: number | string;
  dietType: string;
  preferences: string;
  restrictions: string;
};

export function PlanFields({ defaults }: { defaults?: Partial<PlanValues> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label" htmlFor="goal">Goal</label>
        <input id="goal" name="goal" required className="input" placeholder="Weight management" defaultValue={defaults?.goal} />
      </div>
      <div>
        <label className="label" htmlFor="calorieTarget">Daily calorie target (kcal)</label>
        <input id="calorieTarget" name="calorieTarget" type="number" min={500} max={6000} required className="input" placeholder="2200" defaultValue={defaults?.calorieTarget} />
      </div>
      <div>
        <label className="label" htmlFor="proteinTarget">Protein target (g)</label>
        <input id="proteinTarget" name="proteinTarget" type="number" min={10} max={400} required className="input" placeholder="120" defaultValue={defaults?.proteinTarget} />
      </div>
      <div>
        <label className="label" htmlFor="waterTarget">Water target (L)</label>
        <input id="waterTarget" name="waterTarget" type="number" step="0.1" min={0.5} max={6} required className="input" placeholder="2.5" defaultValue={defaults?.waterTarget} />
      </div>
      <div>
        <label className="label" htmlFor="dietType">Diet</label>
        <input id="dietType" name="dietType" list="diet-types" className="input" placeholder="Vegetarian" defaultValue={defaults?.dietType} />
        <datalist id="diet-types">
          <option value="Omnivore" />
          <option value="Vegetarian" />
          <option value="Vegan" />
          <option value="Pescatarian" />
        </datalist>
      </div>
      <div>
        <label className="label" htmlFor="preferences">Preferences</label>
        <input id="preferences" name="preferences" className="input" placeholder="Indian / Mediterranean" defaultValue={defaults?.preferences} />
      </div>
      <div>
        <label className="label" htmlFor="restrictions">Restrictions</label>
        <input id="restrictions" name="restrictions" className="input" placeholder="None" defaultValue={defaults?.restrictions} />
      </div>
    </div>
  );
}
