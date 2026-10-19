import Link from "next/link";
import { listLeads } from "@/lib/db";
import { requireAdminPage } from "@/lib/adminSession";
import { enquiryTitle } from "@/lib/leadDisplay";
import { formatBeijing } from "@/lib/time";
import { LogoutButton } from "./LogoutButton";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdminPage();
  const leads = listLeads();
  const productTotal = leads.reduce((n, l) => n + l.products.length, 0);

  return (
    <div className="min-h-dvh bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">线索列表</h1>
            <p className="text-sm text-slate-500">陕西朗昊 · 共 {leads.length} 条</p>
          </div>
          <div className="flex items-center gap-3">
            {leads.length > 0 && (
              <div className="flex items-center gap-2">
                {[
                  { href: "/api/admin/export", label: "CSV" },
                  { href: "/api/admin/export/xlsx", label: "Excel" },
                  { href: "/api/admin/export/pdf", label: "PDF" },
                ].map((item) => (
                  <a
                    key={item.label}
                    href={item.href}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    下载 {item.label}
                  </a>
                ))}
              </div>
            )}
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-6">
        {leads.length > 0 && (
          <p className="mb-4 text-xs text-slate-400">
            导出范围：全部 {leads.length} 条咨询（共 {productTotal} 个产品）。CSV 列出照片文件名；Excel 和 PDF
            内含产品照片。
          </p>
        )}
        {leads.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
            还没有收到咨询。
          </p>
        ) : (
          <div>
            {/* column labels (wide screens) */}
            <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_auto] gap-4 px-5 pb-2 text-xs font-medium text-slate-400 md:grid">
              <span>公司 (姓名)</span>
              <span>需求 / 产品</span>
              <span className="w-16 text-center">状态</span>
            </div>
            <ul className="space-y-3">
              {leads.map((lead) => {
                const photos = lead.products.reduce((n, p) => n + p.photos.length, 0);
                const missingIdentity = !lead.name.trim() || !lead.company.trim();
                return (
                  <li key={lead.id}>
                    <Link
                      href={`/admin/leads/${lead.id}`}
                      className="block rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:shadow-sm"
                    >
                      <div className="grid gap-x-4 gap-y-2 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_auto] md:items-center">
                        <div className="flex items-start justify-between gap-3 md:block">
                          <p
                            className={`truncate text-base font-semibold ${missingIdentity ? "text-slate-500" : "text-slate-900"}`}
                          >
                            {enquiryTitle(lead)}
                            {missingIdentity && lead.businessCardImage && (
                              <span className="ml-2 text-xs font-normal text-slate-400">（见名片）</span>
                            )}
                          </p>
                          <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 md:hidden">
                            {lead.status}
                          </span>
                        </div>
                        <div className="min-w-0 text-sm text-slate-500">
                          <p className="truncate">
                            {lead.requestedInformation.length ? lead.requestedInformation.join("、") : "—"}
                          </p>
                          <p className="truncate text-xs text-slate-400">
                            {lead.products.length} 个产品 · {photos} 张照片
                            {lead.products.some((p) => p.sku)
                              ? ` · ${lead.products.map((p) => p.sku).filter(Boolean).join(" · ")}`
                              : ""}
                          </p>
                        </div>
                        <span className="hidden w-16 shrink-0 rounded-full bg-slate-100 px-3 py-1 text-center text-xs font-medium text-slate-600 md:block">
                          {lead.status}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                        <span>{lead.reference}</span>
                        <span>{formatBeijing(lead.createdAt)}</span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
