import { NextResponse } from "next/server";
import { listLeads } from "@/lib/db";

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

const HEADERS = [
  "提交时间",
  "状态",
  "姓名",
  "公司",
  "职位",
  "国家/地区",
  "手机",
  "邮箱",
  "微信",
  "名片文件",
  "产品照片",
  "产品型号",
  "需求",
  "留言",
];

export async function GET() {
  const leads = listLeads();

  const rows = leads.map((lead) =>
    [
      lead.createdAt,
      lead.status,
      lead.name,
      lead.company,
      lead.jobTitle,
      lead.country,
      lead.phone,
      lead.email,
      lead.wechat,
      lead.businessCardImage ?? "",
      lead.productImages.join(" | "),
      lead.productModels.join(" | "),
      lead.requestedInformation.join(" | "),
      lead.message,
    ]
      .map((v) => csvEscape(String(v)))
      .join(","),
  );

  // Leading BOM so Excel opens the Chinese text as UTF-8 instead of guessing wrong.
  const csv = "﻿" + [HEADERS.join(","), ...rows].join("\r\n");
  const filename = `leads-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
