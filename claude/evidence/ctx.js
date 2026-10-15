"use strict";
// Dump webPreferences / sandbox / contextIsolation / nodeIntegration contexts
// with offsets, from the main-process chunk.
const fs = require("fs");
const file = process.argv[2];
const needles = process.argv.slice(3);
const s = fs.readFileSync(file, "utf8");
console.log(`FILE ${file}`);
console.log(`bytes=${Buffer.byteLength(s)} chars=${s.length} lines=${s.split("\n").length}`);
for (const needle of needles) {
  const re = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
  let m, i = 0;
  while ((m = re.exec(s)) !== null) {
    i++;
    const start = Math.max(0, m.index - 300);
    const end = Math.min(s.length, m.index + 500);
    console.log(`\n----- ${needle} #${i} @offset ${m.index} -----`);
    console.log(s.slice(start, end).replace(/\n/g, " "));
    if (i >= 40) { console.log(`... truncated after ${i} occurrences`); break; }
  }
  if (i === 0) console.log(`\n----- ${needle}: 0 occurrences -----`);
}