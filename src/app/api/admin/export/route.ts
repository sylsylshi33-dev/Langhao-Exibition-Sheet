import { NextRequest, NextResponse } from "next/server";
import { listLeads } from "@/lib/db";
import { requireAdminApi } from "@/lib/adminSession";
import { csvCell } from "@/lib/csv";
import { displayName } from "@/lib/leadDisplay";
import { formatBeijing } from "@/lib/time";

/*
 * CSV export of every enquiry. One row per product (the enquiry's contact
 * columns are repeated on each of its rows, so the file filters and pivots
 * cleanly); an enquiry with no products still gets one row. Photos are listed
 * by stored file name. See ../export/xlsx and ../export/pdf for the versions
 * with the photos embedded.
 */

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
  "产品序号",
  "产品编号/SKU",
  "颜色",
  "数量",
  "包装要求",
  "产品照片",
  "需求",
  "留言",
];

export async function GET(request: NextRequest) {
  const denied = requireAdminApi(request);
  if (denied) return denied;

  const rows = listLeads().flatMap((lead) => {
    const lines = lead.products.length > 0 ? lead.products : [null];
    return lines.map((product) =>
      [
        lead.reference,
        formatBeijing(lead.createdAt),
        lead.status,
        displayName(lead),
        lead.company,
        lead.jobTitle,
        lead.country,
        lead.phone,
        lead.email,
        lead.wechat,
        lead.businessCardImage ?? "",
        product ? String(product.position + 1) : "",
        product?.sku ?? "",
        product?.colour ?? "",
        product?.quantity ?? "",
        product?.packaging ?? "",
        product ? product.photos.join(" | ") : "",
        lead.requestedInformation.join(" | "),
        lead.message,
      ]
        .map((v) => csvCell(String(v)))
        .join(","),
    );
  });

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
