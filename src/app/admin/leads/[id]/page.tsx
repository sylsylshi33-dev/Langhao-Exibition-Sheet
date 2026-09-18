import { notFound } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { getLead } from "@/lib/db";
import { StatusSelect } from "./StatusSelect";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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
          <Field label="姓名" value={lead.name} />
          <Field label="公司" value={lead.company} />
          <Field label="职位" value={lead.jobTitle} />
          <Field label="国家/地区" value={lead.country} />
          <Field label="手机" value={lead.phone} />
          <Field label="邮箱" value={lead.email} />
          <Field label="微信" value={lead.wechat} />
          <Field label="提交时间" value={new Date(lead.createdAt).toLocaleString("zh-CN")} />
        </Section>

        {lead.businessCardImage && (
          <Section title="名片">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/admin/uploads/${lead.businessCardImage}`}
              alt="名片"
              className="max-h-72 rounded-xl border border-slate-200 object-contain"
            />
          </Section>
        )}

        {lead.productImages.length > 0 && (
          <Section title="感兴趣的产品照片">
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {lead.productImages.map((src) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={src}
                  src={`/api/admin/uploads/${src}`}
                  alt="产品照片"
                  className="aspect-square rounded-xl border border-slate-200 object-cover"
                />
              ))}
            </div>
          </Section>
        )}

        {lead.productModels.length > 0 && (
          <Section title="产品型号 / 编号">
            <div className="flex flex-wrap gap-2">
              {lead.productModels.map((m) => (
                <span key={m} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
                  {m}
                </span>
              ))}
            </div>
          </Section>
        )}

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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="text-right text-slate-800">{value || "—"}</span>
    </div>
  );
}
