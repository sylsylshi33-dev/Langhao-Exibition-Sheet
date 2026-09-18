"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.replace("/admin");
      router.refresh();
    } else {
      setLoading(false);
      setError("密码错误，请重试。");
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-100 px-5">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <h1 className="text-lg font-semibold text-slate-900">员工登录</h1>
        <p className="mt-1 text-sm text-slate-500">陕西朗昊 · 展会线索后台</p>

        <div className="mt-6 space-y-1.5">
          <label htmlFor="password" className="block text-sm font-medium text-slate-700">
            密码
          </label>
          <input
            id="password"
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 outline-none transition focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10"
          />
        </div>

        {error && <p className="mt-3 text-sm text-rose-500">{error}</p>}

        <button
          type="submit"
          disabled={loading || !password}
          className="mt-6 h-12 w-full rounded-xl bg-slate-900 font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? "登录中…" : "登录"}
        </button>
      </form>
    </div>
  );
}
