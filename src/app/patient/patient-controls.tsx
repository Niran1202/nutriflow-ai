"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";

export function WaterButtons() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const add = async (litres: number) => {
    setBusy(true);
    try {
      await api("/api/water", "POST", { litres });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-2 flex gap-2">
      <button className="btn-secondary px-3 py-1 text-xs" disabled={busy} onClick={() => add(0.25)}>+ Glass (250 ml)</button>
      <button className="btn-secondary px-3 py-1 text-xs" disabled={busy} onClick={() => add(0.5)}>+ Bottle (500 ml)</button>
      <button className="btn-secondary px-3 py-1 text-xs" disabled={busy} onClick={() => add(-0.25)} aria-label="Remove 250 ml">−</button>
    </div>
  );
}

export function DeleteMealButton({ id }: { id: string }) {
  const router = useRouter();
  return (
    <button
      className="text-xs text-muted hover:text-danger"
      aria-label="Delete meal"
      onClick={async () => {
        if (!confirm("Delete this meal?")) return;
        await api(`/api/meals/${id}`, "DELETE");
        router.refresh();
      }}
    >
      ✕
    </button>
  );
}
