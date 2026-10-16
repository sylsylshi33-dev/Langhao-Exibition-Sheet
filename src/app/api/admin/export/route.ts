import { NextRequest, NextResponse } from "next/server";
import { listLeads } from "@/lib/db";
import { requireAdminApi } from "@/lib/adminSession";
import { formatBeijing } from "@/lib/time";

/*
 * CSV cells are visitor-controlled, and staff open this file in Excel. A cell
 * that starts with = + - @ (or a tab/CR) is interpreted as a formula there, so
 * such cells are prefixed with an apostrophe to force plain text. Ordinary
 * phone numbers like "+86 138 0013 8000" are left alone.
 */
const PLAIN_PHONE = /^\+?[\d\s().-]+$/;

function neutralizeFormula(value: string): string {
  if (/^[=+\-@\t\r]/.test(value) && !PLAIN_PHONE.test(value)) return `'${value}`;
  return value;
}

function csvCell(value: string): string {
  const safe = neutralizeFormula(value);
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const HEADERS = [
  "咨询编号",
  "提交时间(北京时间)",
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

export async function GET(request: NextRequest) {
  const denied = requireAdminApi(request);
  if (denied) return denied;

  const rows = listLeads().map((lead) =>
    [
      lead.reference,
      formatBeijing(lead.createdAt),
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
      .map((v) => csvCell(String(v)))
      .join(","),
  );

  // Leading BOM so Excel opens the Chinese text as UTF-8 instead of guessing wrong.
  const csv = "﻿" + [HEADERS.join(","), ...rows].join("\r\n");
  const stamp = formatBeijing(new Date().toISOString()).slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${stamp}.csv"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
