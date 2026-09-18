"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/types";

export function StatusSelect({ leadId, status }: { leadId: string; status: LeadStatus }) {
  const router = useRouter();
  const [current, setCurrent] = useState(status);
  const [saving, setSaving] = useState(false);

  async function handleChange(next: LeadStatus) {
    setCurrent(next);
    setSaving(true);
    await fetch(`/api/admin/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-slate-500">状态</span>
      <select
        value={current}
        disabled={saving}
        onChange={(e) => handleChange(e.target.value as LeadStatus)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
      >
        {LEAD_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </label>
  );
}
