import Link from "next/link";
import { listLeads } from "@/lib/db";
import { LogoutButton } from "./LogoutButton";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const leads = listLeads();

  return (
    <div className="min-h-dvh bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">线索列表</h1>
            <p className="text-sm text-slate-500">陕西朗昊 · 共 {leads.length} 条</p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/api/admin/export"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              下载 CSV
            </a>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-6">
        {leads.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
            还没有收到咨询。
          </p>
        ) : (
          <ul className="space-y-3">
            {leads.map((lead) => (
              <li key={lead.id}>
                <Link
                  href={`/admin/leads/${lead.id}`}
                  className="block rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">
                        {lead.name || "（未填写姓名）"}
                      </p>
                      <p className="truncate text-sm text-slate-500">{lead.company || "—"}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                      {lead.status}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                    <span>
                      感兴趣：
                      {lead.requestedInformation.length ? lead.requestedInformation.join("、") : "—"}
                    </span>
                    <span>{lead.productImages.length} 张产品照片</span>
                    <span>{new Date(lead.createdAt).toLocaleString("zh-CN")}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
