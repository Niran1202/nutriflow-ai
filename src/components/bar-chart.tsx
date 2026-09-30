import { weekdayShort } from "@/lib/dates";

type Point = { date: string; value: number };

/**
 * Single-series daily bar chart with a dashed target line.
 * One series → no legend (the title names it); hover shows the exact value.
 */
export function DailyBarChart({ title, points, target, unit, decimals = 0 }: { title: string; points: Point[]; target: number; unit: string; decimals?: number }) {
  const max = Math.max(target * 1.25, ...points.map((p) => p.value)) || 1;
  const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: decimals });
  const targetPct = (target / max) * 100;

  return (
    <figure>
      <figcaption className="mb-3 flex items-baseline justify-between">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted">target {fmt(target)} {unit}</span>
      </figcaption>
      <div className="relative h-32">
        {/* recessive baseline */}
        <div className="absolute inset-x-0 bottom-0 border-b border-line" />
        <div className="absolute inset-x-0 border-t border-dashed border-muted/60" style={{ bottom: `${targetPct}%` }} aria-hidden />
        <div className="absolute inset-0 flex items-end gap-[2px]">
          {points.map((p) => (
            <div key={p.date} className="group relative flex h-full flex-1 items-end justify-center">
              <div
                className="w-full max-w-7 rounded-t-[4px] bg-brand/85 transition-colors group-hover:bg-brand-strong"
                style={{ height: `${(p.value / max) * 100}%`, minHeight: p.value > 0 ? 2 : 0 }}
              />
              <div className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-md border border-line bg-surface px-2 py-1 text-xs shadow-sm group-hover:block">
                <span className="text-muted">{weekdayShort(p.date)} {p.date.slice(5)}</span>{" "}
                <span className="font-semibold tabular-nums">{fmt(p.value)} {unit}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1 flex gap-[2px] text-center text-[11px] text-muted">
        {points.map((p) => (
          <span key={p.date} className="flex-1">{weekdayShort(p.date)}</span>
        ))}
      </div>
    </figure>
  );
}
