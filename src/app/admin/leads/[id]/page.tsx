import { notFound } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { getLead } from "@/lib/db";
import { requireAdminPage } from "@/lib/adminSession";
import { displayName } from "@/lib/leadDisplay";
import { formatBeijing } from "@/lib/time";
import { StatusSelect } from "./StatusSelect";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPage();
  const { id } = await params;
  const lead = getLead(id);
  if (!lead) notFound();

  return (
    <div className="min-h-dvh bg-slate-100 pb-16">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link href="/admin" className="text-sm font-medium text-slate-500 hover:text-slate-900">
            ← 返回列表
          </Link>
          <StatusSelect leadId={lead.id} status={lead.status} />
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-5 py-6">
        <Section title="联系信息">
          <Field label="姓名" value={displayName(lead)} strong />
          <Field label="公司" value={lead.company} />
          <Field label="职位" value={lead.jobTitle} />
          <Field label="国家/地区" value={lead.country} />
          <Field label="手机" value={lead.phone} />
          <Field label="邮箱" value={lead.email} />
          <Field label="微信" value={lead.wechat} />
          <Field label="咨询编号" value={lead.reference} />
          <Field label="提交时间（北京时间）" value={formatBeijing(lead.createdAt)} />
        </Section>

        {lead.businessCardImage && (
          <Section title="名片">
            <a href={`/api/admin/uploads/${lead.businessCardImage}`} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/admin/uploads/${lead.businessCardImage}`}
                alt="名片"
                className="max-h-72 rounded-xl border border-slate-200 object-contain"
              />
            </a>
          </Section>
        )}

        <Section title={`感兴趣的产品（${lead.products.length}）`}>
          {lead.products.length === 0 ? (
            <p className="text-sm text-slate-400">没有产品记录。</p>
          ) : (
            <ol className="space-y-4">
              {lead.products.map((product) => (
                <li key={product.id} className="rounded-xl border border-slate-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    产品 {product.position + 1}
                  </p>
                  {product.photos.length > 0 ? (
                    <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
                      {product.photos.map((src) => (
                        <a key={src} href={`/api/admin/uploads/${src}`} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/api/admin/uploads/${src}`}
                            alt={`产品 ${product.position + 1} 照片`}
                            loading="lazy"
                            className="aspect-square rounded-xl border border-slate-200 object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-slate-400">未提供照片</p>
                  )}
                  <div className="mt-3 space-y-2">
                    <Field label="产品编号 / SKU" value={product.sku} />
                    <Field label="颜色" value={product.colour} />
                    <Field label="数量" value={product.quantity} />
                    <Field label="包装要求" value={product.packaging} />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Section>

        <Section title="需求">
          {lead.requestedInformation.length ? (
            <div className="flex flex-wrap gap-2">
              {lead.requestedInformation.map((r) => (
                <span key={r} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
                  {r}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">—</p>
          )}
        </Section>

        {lead.message && (
          <Section title="留言">
            <p className="whitespace-pre-wrap text-sm text-slate-700">{lead.message}</p>
          </Section>
        )}
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-slate-400">{label}</span>
      <span
        className={`whitespace-pre-wrap break-words text-right ${strong ? "font-semibold text-slate-900" : "text-slate-800"}`}
      >
        {value || "—"}
      </span>
    </div>
  );
}
