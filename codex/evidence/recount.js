"use strict";
// Independent reconciliation of the corpus counts.
// The earlier note claimed webview/** = 20,119 .js/.mjs files / 545,939,185 B.
// The running census claims 14,782 .js|mjs|cjs files / 383,489,825 B.
// Settle it from the filesystem directly, with no regex/extension assumptions.
const fs = require("fs");
const path = require("path");
const SRC = path.join(process.env.TEMP, "codex-src");

const byExt = new Map();      // ext -> {files, bytes}
const dirs = new Map();       // top-2-level dir -> {files, bytes}
let totalFiles = 0, totalBytes = 0, unreadable = 0;

function walk(d) {
  let ents;
  try { ents = fs.readdirSync(d, { withFileTypes: true }); }
  catch { unreadable++; return; }
  for (const e of ents) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!e.isFile()) continue;
    let sz = 0;
    try { sz = fs.statSync(p).size; } catch { unreadable++; }
    const m = /\.([A-Za-z0-9]+)$/.exec(e.name);
    const ext = m ? m[1].toLowerCase() : "(noext)";
    if (!byExt.has(ext)) byExt.set(ext, { files: 0, bytes: 0 });
    const b = byExt.get(ext);
    b.files++; b.bytes += sz;

    const rel = path.relative(SRC, p).replace(/\\/g, "/");
    const parts = rel.split("/");
    const key = parts.slice(0, 2).join("/");
    if (!dirs.has(key)) dirs.set(key, { files: 0, bytes: 0 });
    const dd = dirs.get(key);
    dd.files++; dd.bytes += sz;

    totalFiles++; totalBytes += sz;
  }
}

walk(SRC);

const rows = [...byExt.entries()].sort((a, b) => b[1].bytes - a[1].bytes);
console.log("=== CODEX EXTRACTED TREE — independent recount ===");
console.log(`root: ${SRC}`);
console.log(`total regular files : ${totalFiles.toLocaleString()}`);
console.log(`total bytes         : ${totalBytes.toLocaleString()}`);
console.log(`unreadable entries  : ${unreadable}`);

console.log("\n=== BY EXTENSION (top 20 by bytes) ===");
console.log(`${"ext".padEnd(12)} ${"files".padStart(8)} ${"bytes".padStart(15)}`);
for (const [ext, v] of rows.slice(0, 20)) {
  console.log(`${ext.padEnd(12)} ${String(v.files).padStart(8)} ${v.bytes.toLocaleString().padStart(15)}`);
}

console.log("\n=== JS-FAMILY SUBTOTALS ===");
for (const ext of ["js", "mjs", "cjs"]) {
  const v = byExt.get(ext);
  console.log(`  .${ext.padEnd(4)} ${v ? String(v.files).padStart(8) + " files  " + v.bytes.toLocaleString().padStart(15) + " B" : "0"}`);
}
const jsFam = ["js", "mjs", "cjs"].reduce((a, e) => a + (byExt.get(e)?.files || 0), 0);
const jsFamBytes = ["js", "mjs", "cjs"].reduce((a, e) => a + (byExt.get(e)?.bytes || 0), 0);
console.log(`  JS FAMILY TOTAL : ${jsFam.toLocaleString()} files, ${jsFamBytes.toLocaleString()} B`);

console.log("\n=== BY TOP-2-LEVEL DIRECTORY (top 20 by bytes) ===");
const drows = [...dirs.entries()].sort((a, b) => b[1].bytes - a[1].bytes);
for (const [k, v] of drows.slice(0, 20)) {
  console.log(`${k.padEnd(34)} ${String(v.files).padStart(8)} ${v.bytes.toLocaleString().padStart(15)}`);
}