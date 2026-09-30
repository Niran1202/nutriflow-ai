"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className="btn-secondary px-3 py-1.5"
      onClick={async () => {
        await api("/api/auth/logout", "POST");
        router.push("/");
        router.refresh();
      }}
    >
      Log out
    </button>
  );
}
