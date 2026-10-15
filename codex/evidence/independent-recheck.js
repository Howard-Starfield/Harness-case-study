"use strict";
// INDEPENDENT re-check of the two most load-bearing quantitative claims,
// deliberately using DIFFERENT methods than the scripts that produced them.
//   1. IPC registration count (round5 used one regex per shape over whole-file strings).
//      Here: count by scanning token-by-token, and cross-check with a literal-substring count.
//   2. F3 code path - verify the quoted snippet is byte-exact at the cited offset.
const fs = require("fs");
const path = require("path");
const SRC = path.join(process.env.TEMP, "codex-src");
const B = path.join(SRC, ".vite", "build");
const EQ = "=".repeat(74);
function hdr(t) { console.log("\n" + EQ + "\n== " + t + "\n" + EQ); }

const files = fs.readdirSync(B).filter((f) => /\.(js|mjs)$/i.test(f));
const ALL = files.map((f) => ({ name: f, text: fs.readFileSync(path.join(B, f), "utf8") }));
console.log("MAIN corpus: " + ALL.length + " files");

// ---------- 1. IPC registrations, two independent counting methods ----------
hdr("1. IPC REGISTRATION COUNT - method A (indexOf scan) vs method B (split scan)");
const TOKENS = ["ipcMain.handle(", "ipcMain.on(", "ipcMain.handleOnce(", "ipcMain.removeHandler("];
for (const tok of TOKENS) {
  // method A: sliding indexOf (no regex at all)
  let a = 0; const fa = new Set();
  for (const it of ALL) {
    let i = it.text.indexOf(tok), c = 0;
    while (i >= 0) { c++; i = it.text.indexOf(tok, i + 1); }
    if (c) { a += c; fa.add(it.name); }
  }
  // method B: split (different engine)
  let b = 0; const fb = new Set();
  for (const it of ALL) {
    const c = it.text.split(tok).length - 1;
    if (c) { b += c; fb.add(it.name); }
  }
  const agree = a === b && fa.size === fb.size;
  console.log("  " + tok.padEnd(24) + " indexOf=" + String(a).padStart(4) +
    "  split=" + String(b).padStart(4) + "  files=" + fa.size + "/" + fb.size +
    (agree ? "   AGREE" : "   *** DISAGREE ***"));
}

// sanity: confirm the total is not a multiple of the file count (the C-D trap)
const handleCount = ALL.reduce((n, it) => n + it.text.split("ipcMain.handle(").length - 1, 0);
const onCount = ALL.reduce((n, it) => n + it.text.split("ipcMain.on(").length - 1, 0);
console.log("\n  TOTAL ipcMain registrations = " + handleCount + " + " + onCount + " = " + (handleCount + onCount));
console.log("  C-D trap check: " + ALL.length + " is the file count; the totals must NOT equal it." +
  ((handleCount + onCount) === ALL.length ? "  *** TRAPPED ***" : "  clear."));

// ---------- 2. F3 byte-exact verification ----------
hdr("2. F3 - verify the quoted update-catch snippet is byte-exact");
const boot = ALL.find((it) => it.name.startsWith("bootstrap"));
const t = boot.text;
console.log("  file: " + boot.name + "  (" + t.length + " chars)");

const checks = [
  ["hresult literal 2147958056", "2147958056"],
  ["allowServiceInstallElevation field", "allowServiceInstallElevation"],
  ["stagePackage call", "stagePackage"],
  ["discardPreparedUpdate", "discardPreparedUpdate"],
  ["throw on non-matching error", "throw await this.discardPreparedUpdate()"],
];
for (const [label, needle] of checks) {
  const i = t.indexOf(needle);
  console.log("  " + label.padEnd(34) + (i < 0 ? "ABSENT" : "present @ " + i));
}

// find and print the exact catch block
const catchIdx = t.indexOf("catch(e){if(!this.options.allowServiceInstallElevation");
hdr("2b. exact catch block as it appears in the file");
if (catchIdx >= 0) {
  console.log(t.slice(catchIdx, catchIdx + 340));
} else {
  // fall back: locate around the hresult literal
  const h = t.indexOf("2147958056");
  const s = Math.max(0, h - 320);
  console.log("  (pattern not matched verbatim; showing context around the hresult literal)");
  console.log(t.slice(s, h + 220));
}

// ---------- 3. sandbox constants re-derived independently ----------
hdr("3. Sandbox constants re-derived from the literal block");
const src = ALL.find((it) => it.name.startsWith("src-"));
const blk = src.text.slice(src.text.indexOf("co=`Timed out waiting for Windows sandbox setup"), 0);
const m = /co=`Timed out waiting for Windows sandbox setup completion`,\s*lo=(\d+),\s*uo=(\d+)/.exec(blk);
if (m) {
  console.log("  error message : `Timed out waiting for Windows sandbox setup completion`");
  console.log("  lo (timeout)  : " + m[1] + " ms = " + (m[1] / 60000) + " min");
  console.log("  uo (cooldown) : " + m[2] + " ms = " + (m[2] / 60000) + " min");
  console.log("  ratio timeout:cooldown = " + (m[1] / m[2]).toFixed(1) + ":1");
} else console.log("  (constant block not matched)");

// verify r.fail rejects
const failIdx = src.text.indexOf("r.fail(Error(co))");
console.log("\n  `r.fail(Error(co))` present @ " + (failIdx < 0 ? "ABSENT" : failIdx));
const failDef = /fail:e=>\{i\(\)&&n\.reject\(e\)\}/.exec(src.text);
console.log("  `fail` is defined as n.reject(...) : " + (failDef ? "YES -> timeout REJECTS" : "NOT MATCHED"));