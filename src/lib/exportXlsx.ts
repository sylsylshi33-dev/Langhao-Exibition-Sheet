import ExcelJS from "exceljs";
import { displayName } from "./leadDisplay";
import { formatBeijing } from "./time";
import { PhotoLoader, skippedLabel, type LoadedPhoto } from "./exportPhotos";
import type { Lead } from "./types";

/*
 * Excel export: two sheets that stay linked by the enquiry reference.
 *   "咨询"  one row per enquiry (contact details, request, message, business card)
 *   "产品"  one row per product, with the customer repeated and photos embedded
 *
 * Every visitor-supplied value is written as an ordinary string cell, never as
 * a formula, so text such as "=HYPERLINK(...)" is shown as text and not run.
 */

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" }, name: "Microsoft YaHei" };
const BODY_FONT: Partial<ExcelJS.Font> = { name: "Microsoft YaHei", size: 10 };
const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFCBD5E1" } },
  left: { style: "thin", color: { argb: "FFCBD5E1" } },
  bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
  right: { style: "thin", color: { argb: "FFCBD5E1" } },
};

const PHOTO_BOX = { width: 150, height: 112 }; // px
const PHOTO_COLUMN_WIDTH = 23; // characters ≈ 166 px
const PHOTO_ROW_POINTS = 96; // ≈ 128 px
const CARD_BOX = { width: 190, height: 112 };
// Enquiries taken before products were split up can hold up to 10 photos in one product.
const MAX_PHOTO_COLUMNS = 10;

function styleHeader(row: ExcelJS.Row) {
  row.height = 24;
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    cell.border = BORDER;
  });
}

function styleBody(row: ExcelJS.Row) {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = BODY_FONT;
    cell.alignment = { vertical: "top", wrapText: true };
    cell.border = BORDER;
  });
}

function fit(box: { width: number; height: number }, w: number, h: number) {
  const scale = Math.min(box.width / w, box.height / h, 1);
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

export interface XlsxResult {
  buffer: Buffer;
  embedded: number;
  skipped: number;
}

export async function buildXlsx(leads: Lead[], now = new Date()): Promise<XlsxResult> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "陕西朗昊";
  workbook.created = now;

  const loader = new PhotoLoader();
  const productCount = leads.reduce((n, l) => n + l.products.length, 0);
  const photoColumns = Math.min(
    MAX_PHOTO_COLUMNS,
    Math.max(1, ...leads.flatMap((l) => l.products.map((p) => p.photos.length))),
  );

  /* ---------- sheet 2 first so product photos get the image budget before business cards ---------- */
  const products = workbook.addWorksheet("产品", { views: [{ state: "frozen", ySplit: 1 }] });
  products.columns = [
    { header: "咨询编号", key: "reference", width: 20 },
    { header: "姓名", key: "name", width: 14 },
    { header: "公司", key: "company", width: 22 },
    { header: "提交时间(北京时间)", key: "time", width: 20 },
    { header: "状态", key: "status", width: 9 },
    { header: "产品序号", key: "n", width: 9 },
    { header: "产品编号 / SKU", key: "sku", width: 20 },
    { header: "颜色", key: "colour", width: 14 },
    { header: "数量", key: "quantity", width: 12 },
    { header: "包装要求", key: "packaging", width: 30 },
    ...Array.from({ length: photoColumns }, (_, i) => ({
      header: `照片 ${i + 1}`,
      key: `photo${i}`,
      width: PHOTO_COLUMN_WIDTH,
    })),
  ];
  styleHeader(products.getRow(1));
  const firstPhotoCol = 10; // zero-based index of 照片 1

  for (const lead of leads) {
    for (const product of lead.products) {
      const row = products.addRow({
        reference: lead.reference,
        name: displayName(lead),
        company: lead.company,
        time: formatBeijing(lead.createdAt),
        status: lead.status,
        n: product.position + 1,
        sku: product.sku,
        colour: product.colour,
        quantity: product.quantity,
        packaging: product.packaging,
      });
      styleBody(row);

      const photos: LoadedPhoto[] = [];
      for (const rel of product.photos) photos.push(await loader.load(rel));
      let embeddedHere = 0;
      photos.forEach((photo, i) => {
        if (photo.kind === "image") {
          const id = workbook.addImage({ buffer: photo.bytes as unknown as ExcelJS.Buffer, extension: photo.format });
          const ext = fit(PHOTO_BOX, photo.width, photo.height);
          products.addImage(id, {
            tl: { col: firstPhotoCol + i + 0.04, row: row.number - 1 + 0.04 },
            ext,
            editAs: "oneCell",
          });
          embeddedHere++;
        } else {
          row.getCell(firstPhotoCol + i + 1).value = skippedLabel(photo);
        }
      });
      if (embeddedHere > 0) row.height = PHOTO_ROW_POINTS;
    }
  }
  if (productCount > 0) {
    products.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 10 + photoColumns } };
  } else {
    products.addRow({ reference: "（没有产品记录）" });
  }

  /* ---------- sheet 1 ---------- */
  const enquiries = workbook.addWorksheet("咨询", { views: [{ state: "frozen", ySplit: 1 }] });
  enquiries.columns = [
    { header: "咨询编号", key: "reference", width: 20 },
    { header: "提交时间(北京时间)", key: "time", width: 20 },
    { header: "状态", key: "status", width: 9 },
    { header: "姓名", key: "name", width: 14 },
    { header: "公司", key: "company", width: 22 },
    { header: "职位", key: "jobTitle", width: 16 },
    { header: "国家/地区", key: "country", width: 14 },
    { header: "手机", key: "phone", width: 17 },
    { header: "邮箱", key: "email", width: 26 },
    { header: "微信", key: "wechat", width: 16 },
    { header: "需求", key: "request", width: 20 },
    { header: "留言", key: "message", width: 36 },
    { header: "产品数", key: "count", width: 8 },
    { header: "名片", key: "card", width: 28 },
  ];
  styleHeader(enquiries.getRow(1));
  const cardCol = 13; // zero-based index of 名片

  for (const lead of leads) {
    const row = enquiries.addRow({
      reference: lead.reference,
      time: formatBeijing(lead.createdAt),
      status: lead.status,
      name: displayName(lead),
      company: lead.company,
      jobTitle: lead.jobTitle,
      country: lead.country,
      phone: lead.phone,
      email: lead.email,
      wechat: lead.wechat,
      request: lead.requestedInformation.join("、"),
      message: lead.message,
      count: lead.products.length,
    });
    styleBody(row);

    if (lead.businessCardImage) {
      const card = await loader.load(lead.businessCardImage);
      if (card.kind === "image") {
        const id = workbook.addImage({ buffer: card.bytes as unknown as ExcelJS.Buffer, extension: card.format });
        enquiries.addImage(id, {
          tl: { col: cardCol + 0.04, row: row.number - 1 + 0.04 },
          ext: fit(CARD_BOX, card.width, card.height),
          editAs: "oneCell",
        });
        row.height = PHOTO_ROW_POINTS;
      } else {
        row.getCell(cardCol + 1).value = skippedLabel(card);
      }
    }
  }
  if (leads.length > 0) {
    enquiries.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 14 } };
  }

  /* ---------- notes ---------- */
  const notes = [`导出时间（北京时间）：${formatBeijing(now.toISOString())}`, `范围：全部咨询，共 ${leads.length} 条，${productCount} 个产品`];
  if (loader.skipped > 0) {
    notes.push(`有 ${loader.skipped} 张照片未嵌入（体积上限、格式不支持或文件缺失），请在后台查看。`);
  }
  const info = workbook.addWorksheet("说明");
  info.getColumn(1).width = 80;
  notes.forEach((line) => {
    const row = info.addRow([line]);
    row.getCell(1).font = BODY_FONT;
  });

  const written = await workbook.xlsx.writeBuffer();
  return { buffer: Buffer.from(written as ArrayBuffer), embedded: loader.embedded, skipped: loader.skipped };
}
