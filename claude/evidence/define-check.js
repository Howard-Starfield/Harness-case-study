"use strict";
// Is __ELECTRON_WINDOW_ALLOWED_ORIGINS__ defined in the shipped claude.exe?
// If it is absent, guard Yjr fails OPEN (returns true for any origin) for the
// whole electron_window namespace. Streaming scan; never loads the file whole.
const fs = require("fs");
const p = process.argv[2];
const NEEDLES = [
  "__ELECTRON_WINDOW_ALLOWED_ORIGINS__",
  "__ELECTRON_ALLOWED_ORIGINS__",
  "__ELECTRON_SOMETHING_",
];

const fd = fs.openSync(p, "r");
const size = fs.fstatSync(fd).size;
const CH = 1 << 22;
const hits = new Map(NEEDLES.map((n) => [n, []]));
const maxLen = Math.max(...NEEDLES.map((n) => n.length));
const buf = Buffer.alloc(CH + maxLen);
let carry = 0, off = 0;

while (off < size) {
  const n = fs.readSync(fd, buf, carry, Math.min(CH, size - off), off);
  const total = carry + n;
  for (const needle of NEEDLES) {
    let i = -1;
    while ((i = buf.indexOf(needle, i + 1)) >= 0 && i < total) {
      const abs = off - carry + i;
      const arr = hits.get(needle);
      if (!arr.includes(abs)) arr.push(abs);
    }
  }
  carry = Math.min(maxLen - 1, total);
  buf.copy(buf, 0, total - carry, total);
  off += CH;
}
fs.closeSync(fd);

console.log(`file: ${p}`);
console.log(`size: ${size} bytes`);
for (const [needle, arr] of hits) {
  console.log(`\n"${needle}" -> ${arr.length} occurrence(s)`);
  for (const a of arr.slice(0, 20)) console.log(`    offset 0x${a.toString(16)} (${a})`);
}

// For each hit, show 200 bytes of context so we can see if it's a *definition*
// (e.g. a string literal in a resource bundle) or just a reference in V8 bytecode.
const fd2 = fs.openSync(p, "r");
for (const [needle, arr] of hits) {
  for (const a of arr.slice(0, 6)) {
    const ctx = Buffer.alloc(260);
    fs.readSync(fd2, ctx, 0, 260, Math.max(0, a - 60));
    const s = ctx.toString("latin1").replace(/[^\x20-\x7e]/g, ".");
    console.log(`\n--- context @0x${a.toString(16)} for ${needle} ---`);
    console.log("  " + s);
  }
}
fs.closeSync(fd2);
