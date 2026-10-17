// Counts CSV records (newlines inside quoted cells do not end a record). Reads stdin.
let data = "";
process.stdin.on("data", (c) => (data += c)).on("end", () => {
  let rows = 0;
  let quoted = false;
  for (const ch of data) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "\n" && !quoted) rows++;
  }
  console.log(rows);
});
