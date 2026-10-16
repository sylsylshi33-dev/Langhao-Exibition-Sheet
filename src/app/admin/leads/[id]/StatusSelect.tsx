"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/types";

export function StatusSelect({ leadId, status }: { leadId: string; status: LeadStatus }) {
  const router = useRouter();
  const [current, setCurrent] = useState(status);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");

  async function handleChange(next: LeadStatus) {
    const previous = current;
    setCurrent(next);
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (res.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!res.ok) throw new Error("save failed");
      router.refresh();
    } catch {
      setCurrent(previous);
      setError("保存失败，请重试");
    } finally {
      setSaving(false);
    }
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
      {error && <span className="text-xs text-rose-500">{error}</span>}
    </label>
  );
}
