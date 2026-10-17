/* eslint-disable @typescript-eslint/no-require-imports -- plain Node script run by the shell test suites */
// Prints a JSON summary of an .xlsx file (used by tests/products.test.sh).
//   node inspect-xlsx.cjs <repo> <file>
const path = require("path");
const crypto = require("crypto");
const ExcelJS = require(path.join(process.argv[2], "node_modules", "exceljs"));

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(process.argv[3]);
  const sheets = wb.worksheets.map((ws) => {
    const rows = [];
    ws.eachRow((row) => rows.push(row.values.slice(1).map((v) => (v && typeof v === "object" && "formula" in v ? { formula: v.formula } : v))));
    const images = ws.getImages().map((img) => ({
      row: Math.floor(img.range.tl.nativeRow ?? img.range.tl.row),
      col: Math.floor(img.range.tl.nativeCol ?? img.range.tl.col),
      sha1: crypto.createHash("sha1").update(wb.getImage(img.imageId).buffer).digest("hex"),
      extension: wb.getImage(img.imageId).extension,
    }));
    return { name: ws.name, rows, images };
  });
  console.log(JSON.stringify({ sheets }));
})().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
