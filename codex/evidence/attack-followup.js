"use strict";
// Follow-ups from the headline attack:
//  (1) \brunas\b = 5 word-bounded hits in 3 files - are these real elevation verbs?
//      (my C-B correction claimed 0 elevation-verb runas, based on SUBSTRING hits in MAIN)
//  (2) the 465 ".exe literals" are contaminated by minified identifiers ending in `.exe`.
//      Extract only literals where `exe` is a real extension (preceded by a real basename).
const fs = require("fs");
const path = require("path");
const SRC = path.join(process.env.TEMP, "codex-src");
const EQ = "=".repeat(74);
function hdr(t) { console.log("\n" + EQ + "\n== " + t + "\n" + EQ); }

function walkJs(d, out = []) {
  let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walkJs(p, out);
    else if (/\.(js|mjs|cjs)$/i.test(e.name)) out.push(p);
  }
  return out;
}
const MAIN = walkJs(path.join(SRC, ".vite", "build"));
const REND = walkJs(path.join(SRC, "webview"));
const isMain = (p) => p.indexOf(path.sep + ".vite" + path.sep) >= 0;

// ---------- (1) word-bounded `runas` ----------
hdr("(1) \\brunas\\b - word-bounded, with context");
const runasRe = /\brunas\b/gi;
let n = 0;
for (const p of MAIN.concat(REND)) {
  const t = fs.readFileSync(p, "utf8");
  runasRe.lastIndex = 0;
  let m;
  while ((m = runasRe.exec(t)) !== null) {
    n++;
    const s = Math.max(0, m.index - 220), e = Math.min(t.length, m.index + 220);
    console.log("\n  [" + n + "] " + (isMain(p) ? "MAIN  " : "RENDER") + " " +
      path.relative(SRC, p).replace(/\\/g, "/") + " @" + m.index);
    console.log("      ..." + t.slice(s, e).replace(/\s+/g, " ") + "...");
  }
}
console.log("\n  TOTAL word-bounded `runas`: " + n);
console.log("  (compare: SUBSTRING `runas` = 138, all/most inside `runAsync`)");

// ---------- (2) clean .exe literal extraction ----------
hdr("(2) REAL .exe literals (basename must not itself be a dotted minified chain)");
// A real filename: 1+ word chars/dash/dot, but the final segment before .exe must not be
// preceded by another dot-chain of lowercase identifiers. Heuristic: the char before the
// basename must not be '.', and the basename itself should not contain 3+ dot-separated
// all-lowercase identifier-looking parts.
const exeRe = /\b([A-Za-z0-9_-]{1,40}\.exe)\b/g;
const real = new Map(), noisy = new Map();
for (const p of MAIN.concat(REND)) {
  const t = fs.readFileSync(p, "utf8");
  exeRe.lastIndex = 0; let m;
  while ((m = exeRe.exec(t)) !== null) {
    const k = m[1];
    const parts = k.split(".");
    // noise heuristic: looks like `foo.bar.exe` where foo.bar is an all-lowercase identifier chain
    const looksMinified = parts.length >= 3 && parts.slice(0, -1).every((s) => /^[a-z_$][\w$]*$/.test(s));
    const bucket = looksMinified ? noisy : real;
    bucket.set(k, (bucket.get(k) || 0) + 1);
  }
}
console.log("  plausible real filenames: " + real.size + "   minifier-noise matches: " + noisy.size);
console.log("\n  REAL .exe literals in the JS corpus:");
for (const [k, v] of [...real.entries()].sort((a, b) => b[1] - a[1])) {
  console.log("    " + k.padEnd(30) + v);
}
const security = [...real.keys()].filter((k) => /elev|sandbox|service|runner|setup|codex|admin|runas/i.test(k));
console.log("\n  security-relevant subset: " + (security.join(", ") || "(none beyond those listed)"));
console.log("  contains 'elevation_service.exe' ? " + real.has("elevation_service.exe"));