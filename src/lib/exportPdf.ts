import path from "node:path";
import PDFDocument from "pdfkit";
import { displayName } from "./leadDisplay";
import { formatBeijing } from "./time";
import { PhotoLoader, skippedLabel, type LoadedPhoto } from "./exportPhotos";
import type { Lead, LeadProduct } from "./types";

/*
 * Printable PDF: every enquiry is a section (header bar, contact details,
 * request, message, business card) followed by one boxed block per product
 * with its photos and details. Blocks are never split across pages; an
 * enquiry header always travels with at least its first product.
 *
 * A PDF must embed its own font, and the server has no Chinese font, so a
 * subset of Noto Sans SC is shipped in assets/fonts (see its README).
 */

export const PDF_FONT_RELATIVE = "assets/fonts/NotoSansSC-Regular-subset.otf";

function fontPath(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), PDF_FONT_RELATIVE);
}

const MARGIN = 40;
const FOOTER_SPACE = 46;
const INK = "#0f172a";
const MUTED = "#64748b";
const LINE = "#cbd5e1";
const PHOTO = 92;
const PHOTO_GAP = 6;
const PHOTOS_PER_ROW = 3;
const TEXT_X_OFFSET = 3 * PHOTO + 2 * PHOTO_GAP + 16;

export interface PdfResult {
  buffer: Buffer;
  embedded: number;
  skipped: number;
}

export async function buildPdf(leads: Lead[], now = new Date()): Promise<PdfResult> {
  const doc = new PDFDocument({
    size: "A4",
    margin: MARGIN,
    bufferPages: true,
    font: fontPath(),
    info: { Title: "展会咨询导出", Author: "陕西朗昊", CreationDate: now },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const finished = new Promise<void>((resolve, reject) => {
    doc.on("end", resolve);
    doc.on("error", reject);
  });

  const loader = new PhotoLoader();
  const width = doc.page.width - MARGIN * 2;
  const bottom = () => doc.page.height - FOOTER_SPACE;
  let y = MARGIN;

  /** Starts a new page if `height` does not fit; returns true when it did. */
  const ensure = (height: number): boolean => {
    // A block taller than a whole page cannot be kept together; start it on a fresh page.
    if (y + height > bottom() && y > MARGIN) {
      doc.addPage();
      y = MARGIN;
      return true;
    }
    return false;
  };
  const measure = (text: string, size: number, w: number) =>
    doc.fontSize(size).heightOfString(text, { width: w });
  const write = (text: string, x: number, top: number, w: number, size: number, color = INK) => {
    doc.fontSize(size).fillColor(color).text(text, x, top, { width: w });
  };

  /** "label  value" laid out in a column; returns the height used. */
  const keyValue = (label: string, value: string, x: number, top: number, w: number) => {
    const labelW = 62;
    const text = value || "—";
    const h = Math.max(measure(label, 8, labelW), measure(text, 9.5, w - labelW));
    write(label, x, top + 1, labelW, 8, MUTED);
    write(text, x + labelW, top, w - labelW, 9.5, value ? INK : MUTED);
    return h + 3;
  };
  const keyValueHeight = (label: string, value: string, w: number) => {
    const labelW = 62;
    return Math.max(measure(label, 8, labelW), measure(value || "—", 9.5, w - labelW)) + 3;
  };

  /* ---------- title ---------- */
  const productCount = leads.reduce((n, l) => n + l.products.length, 0);
  write("展会咨询导出", MARGIN, y, width, 18);
  y += 26;
  write(
    `导出时间（北京时间）：${formatBeijing(now.toISOString())}　·　范围：全部咨询，共 ${leads.length} 条，${productCount} 个产品`,
    MARGIN,
    y,
    width,
    9,
    MUTED,
  );
  y += 22;

  if (leads.length === 0) {
    write("暂无咨询。", MARGIN, y + 8, width, 11, MUTED);
  }

  /* ---------- helpers that draw an image or a placeholder ---------- */
  const drawPhoto = (photo: LoadedPhoto, x: number, top: number, w: number, h: number) => {
    doc.save().roundedRect(x, top, w, h, 3).lineWidth(0.5).strokeColor(LINE).stroke().restore();
    if (photo.kind === "image") {
      try {
        doc.image(photo.bytes, x + 2, top + 2, { fit: [w - 4, h - 4], align: "center", valign: "center" });
        return;
      } catch {
        /* fall through to the placeholder */
      }
    }
    const label = photo.kind === "skipped" ? skippedLabel(photo) : "无法显示";
    doc.fontSize(6.5).fillColor(MUTED).text(label, x + 4, top + 6, { width: w - 8, height: h - 10, ellipsis: true });
  };

  const productBlock = async (product: LeadProduct) => {
    const photos: LoadedPhoto[] = [];
    for (const rel of product.photos) photos.push(await loader.load(rel));

    const textW = width - TEXT_X_OFFSET - 10;
    const lines: [string, string][] = [
      ["产品编号 / SKU", product.sku],
      ["颜色", product.colour],
      ["数量", product.quantity],
      ["包装要求", product.packaging],
    ];
    const textH =
      measure(`产品 ${product.position + 1}`, 9, textW) + 6 +
      lines.reduce((h, [k, v]) => h + keyValueHeight(k, v, textW), 0);
    const rows = Math.max(1, Math.ceil(photos.length / PHOTOS_PER_ROW));
    const photosH = rows * PHOTO + (rows - 1) * PHOTO_GAP;
    const height = Math.max(textH, photosH) + 16;

    return { photos, lines, textW, height, draw: (top: number) => {
      doc.save().roundedRect(MARGIN, top, width, height, 5).lineWidth(0.6).strokeColor(LINE).stroke().restore();
      if (photos.length === 0) {
        write("（未提供照片）", MARGIN + 10, top + 10, TEXT_X_OFFSET - 20, 8.5, MUTED);
      }
      photos.forEach((photo, i) => {
        const col = i % PHOTOS_PER_ROW;
        const row = Math.floor(i / PHOTOS_PER_ROW);
        drawPhoto(photo, MARGIN + 8 + col * (PHOTO + PHOTO_GAP), top + 8 + row * (PHOTO + PHOTO_GAP), PHOTO, PHOTO);
      });
      let ty = top + 8;
      const x = MARGIN + TEXT_X_OFFSET;
      write(`产品 ${product.position + 1}`, x, ty, textW, 9, MUTED);
      ty += measure(`产品 ${product.position + 1}`, 9, textW) + 6;
      for (const [k, v] of lines) ty += keyValue(k, v, x, ty, textW);
    } };
  };

  /* ---------- enquiries ---------- */
  for (const lead of leads) {
    const colW = (width - 24) / 2;
    const left: [string, string][] = [
      ["姓名", displayName(lead)],
      ["公司", lead.company],
      ["职位", lead.jobTitle],
      ["国家/地区", lead.country],
    ];
    const right: [string, string][] = [
      ["手机", lead.phone],
      ["邮箱", lead.email],
      ["微信", lead.wechat],
      ["需求", lead.requestedInformation.join("、")],
    ];
    const leftH = left.reduce((h, [k, v]) => h + keyValueHeight(k, v, colW), 0);
    const rightH = right.reduce((h, [k, v]) => h + keyValueHeight(k, v, colW), 0);
    const messageH = lead.message ? keyValueHeight("留言", lead.message, width - 16) : 0;
    const card = lead.businessCardImage ? await loader.load(lead.businessCardImage) : null;
    const CARD_H = 84;
    const infoH = Math.max(leftH, rightH) + messageH + (card ? CARD_H + 8 : 0) + 14;
    const BAR_H = 22;

    const blocks = [];
    for (const product of lead.products) blocks.push(await productBlock(product));
    const firstBlockH = blocks.length > 0 ? blocks[0].height + 6 : 22;

    ensure(BAR_H + infoH + firstBlockH);

    // header bar
    doc.save().roundedRect(MARGIN, y, width, BAR_H, 4).fill(INK).restore();
    write(`${displayName(lead)}　　${lead.reference}　　${formatBeijing(lead.createdAt)}　　${lead.status}`, MARGIN + 10, y + 6, width - 20, 9.5, "#ffffff");
    y += BAR_H + 8;

    // contact details
    let ly = y;
    for (const [k, v] of left) ly += keyValue(k, v, MARGIN + 8, ly, colW);
    let ry = y;
    for (const [k, v] of right) ry += keyValue(k, v, MARGIN + 16 + colW, ry, colW);
    y = Math.max(ly, ry);
    if (lead.message) y += keyValue("留言", lead.message, MARGIN + 8, y, width - 16);
    if (card) {
      y += 4;
      drawPhoto(card, MARGIN + 8, y, 132, CARD_H);
      write("名片", MARGIN + 150, y + 2, 60, 8, MUTED);
      y += CARD_H + 4;
    }
    y += 6;

    if (blocks.length === 0) {
      write("（该咨询没有产品记录）", MARGIN + 8, y, width - 16, 9, MUTED);
      y += 22;
    }
    for (const block of blocks) {
      // Products that run onto a new page say whose they are.
      if (ensure(block.height + 6 + 16)) {
        write(
          `${lead.reference}　${[displayName(lead), lead.company].filter(Boolean).join(" · ")}（续）`,
          MARGIN,
          y,
          width,
          8.5,
          MUTED,
        );
        y += 16;
      }
      block.draw(y);
      y += block.height + 6;
    }
    y += 12;
  }

  if (loader.skipped > 0) {
    ensure(30);
    write(`注：有 ${loader.skipped} 张照片未嵌入本文件（体积上限、格式不支持或文件缺失），请在后台查看。`, MARGIN, y, width, 8.5, MUTED);
  }

  /* ---------- footer on every page ---------- */
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Text below the bottom margin would otherwise make pdfkit add a page.
    doc.page.margins.bottom = 0;
    doc
      .fontSize(8)
      .fillColor(MUTED)
      .text(`陕西朗昊 · 展会咨询导出　　第 ${i + 1} / ${range.count} 页`, MARGIN, doc.page.height - 30, {
        width,
        align: "center",
        lineBreak: false,
      });
  }

  doc.end();
  await finished;
  return { buffer: Buffer.concat(chunks), embedded: loader.embedded, skipped: loader.skipped };
}
