"use strict";
// Reconciler: (a) resolve the AudioContext 51-vs-24 discrepancy between the two
// independent renderer scans, (b) split the voice census into CODE vs LOCALE corpora.
// Locale bundles (translations) dominate raw counts and must never be mixed into a
// code claim without being stated separately.
const fs = require("fs");
const SRC = process.env.TEMP + "\\codex-src";
const W = SRC + "\\webview";
const EQ = "=".repeat(78);

const files = [];
(function walk(d) {
  let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = d + "\\" + e.name;
    if (e.isDirectory()) walk(p);
    else if (/\.(js|mjs|cjs)$/i.test(e.name)) files.push(p);
  }
})(W);

// Locale bundles: BCP-47-ish tag or opaque short tag immediately followed by a content hash.
// Observed: tl-4614d59bf204, ml-2e0bff9a91d9, fr-FR-c8896d04a499, da-DK-aa64329579f1,
//           aM-a20080d5c177, es-9658ddc25670, it-IT-10496c681795
const LOCALE_RE = /^[a-z]{2,3}(-[A-Za-z]{2,4})?-[0-9a-f]{8,}\.js$/i;
function isLocale(base) { return LOCALE_RE.test(base); }

let codeN = 0, locN = 0, codeB = 0, locB = 0;
const localeFiles = [];
for (const f of files) {
  const base = f.slice(f.lastIndexOf("\\") + 1);
  const sz = fs.statSync(f).size;
  if (isLocale(base)) { locN++; locB += sz; localeFiles.push(base); }
  else { codeN++; codeB += sz; }
}
console.log(EQ);
console.log("== CORPUS SPLIT");
console.log(EQ);
console.log("  TOTAL   files=" + String(files.length).padStart(6) + "  bytes=" + files.length.toLocaleString());
console.log("  CODE    files=" + String(codeN).padStart(6) + "  bytes=" + codeB.toLocaleString());
console.log("  LOCALE  files=" + String(locN).padStart(6) + "  bytes=" + locB.toLocaleString());
console.log("  locale pattern: /^[a-z]{2,3}(-[A-Za-z]{2,4})?-[0-9a-f]{8,}\\.js$/i");

// ---------------------------------------------------------------- AudioContext reconciliation
console.log("");
console.log(EQ);
console.log("== AudioContext RECONCILIATION (scan A = match(), scan B = manual exec loop)");
console.log(EQ);
const reA = /\b(?:webkit)?AudioContext\b/g;          // scan A (voice-render.js)
const reB = /\b(?:webkit)?AudioContext\b/gi;         // scan B (voice-render3.js, case-insensitive)
let totA = 0, totB = 0, totCaseOnly = 0;
const perFile = [];
for (const f of files) {
  let t; try { t = fs.readFileSync(f, "utf8"); } catch { continue; }
  const a = (t.match(reA) || []).length;
  const b = (t.match(reB) || []).length;
  // Isolate the case-insensitivity contribution.
  let ci = 0;
  const reC = /\b(?:webkit)?audiocontext\b/gi;
  reC.lastIndex = 0; let m;
  while ((m = reC.exec(t)) !== null) { ci++; if (reC.lastIndex === 0) break; }
  const upperOnly = ci - a;
  if (b > 0) {
    totA += a; totB += b; totCaseOnly += upperOnly;
    perFile.push([f.slice(SRC.length + 1).replace(/\\/g, "/"), a, b, upperOnly]);
  }
}
console.log("  scan A  /\\b(?:webkit)?AudioContext\\b/g   total=" + totA + "   files=" + perFile.filter(function (x) { return x[1] > 0; }).length);
console.log("  scan B  /\\b(?:webkit)?AudioContext\\b/gi  total=" + totB + "   files=" + perFile.filter(function (x) { return x[2] > 0; }).length);
console.log("  case-insensitive-only extra occurrences (e.g. 'audiocontext'): " + totCaseOnly);
console.log("");
console.log("  per-file (A=case-sensitive, B=case-insensitive, X=case-only extras):");
perFile.sort(function (x, y) { return y[2] - x[2]; });
for (const p of perFile) {
  console.log("    " + p[0].padEnd(64) + "A=" + String(p[1]).padStart(4) + "  B=" + String(p[2]).padStart(4) + "  X=" + String(p[3]).padStart(4));
}

// ---------------------------------------------------------------- voice census, code vs locale
console.log("");
console.log(EQ);
console.log("== VOICE CENSUS: CODE vs LOCALE (occurrences)");
console.log(EQ);

const PROBE_SRC = [
  ["SpeechRecognition",         "\\b(?:webkit)?SpeechRecognition\\b", "gi"],
  ["speechSynthesis",          "\\bspeechSynthesis\\b", "g"],
  ["SpeechSynthesisUtterance", "SpeechSynthesisUtterance", "g"],
  ["MediaRecorder",            "\\bMediaRecorder\\b", "g"],
  ["getUserMedia",             "getUserMedia", "g"],
  ["AudioContext",             "\\b(?:webkit)?AudioContext\\b", "gi"],
  ["createMediaStreamSource",  "createMediaStreamSource|createMediaStreamTracks", "g"],
  ["audioWorklet",             "udioWorklet", "g"],
  ["interimResults",           "\\binterimResults\\b", "g"],
  ["dictation",                "\\bdictation\\w*", "gi"],
  ["voice",                    "\\bvoic\\w+", "gi"],
  ["microphone",               "\\bmicrophone\\w*", "gi"],
  ["audio",                    "\\baudios?\\b", "gi"],
  ["CONTROL ipcBridge",        "\\bipcBridge\\b", "g"],
];

const compiled = PROBE_SRC.map(function (p) { return [p[0], new RegExp(p[1], p[2])]; });
const codeTot = new Map(), locTot = new Map(), codeHit = new Map(), locHit = new Map();
for (const c of compiled) { codeTot.set(c[0], 0); locTot.set(c[0], 0); codeHit.set(c[0], new Map()); locHit.set(c[0], new Map()); }

function countAll(text, re) {
  re.lastIndex = 0;
  let n = 0;
  while (re.exec(text) !== null) { n++; if (re.lastIndex === 0) break; }
  return n;
}

for (const f of files) {
  let t; try { t = fs.readFileSync(f, "utf8"); } catch { continue; }
  const base = f.slice(f.lastIndexOf("\\") + 1);
  const rel = f.slice(SRC.length + 1).replace(/\\/g, "/");
  const isLoc = isLocale(base);
  for (const pair of compiled) {
    const c = countAll(t, pair[1]);
    if (c > 0) {
      if (isLoc) { locTot.set(pair[0], locTot.get(pair[0]) + c); const h = locHit.get(pair[0]); h.set(rel, (h.get(rel) || 0) + c); }
      else { codeTot.set(pair[0], codeTot.get(pair[0]) + c); const h = codeHit.get(pair[0]); h.set(rel, (h.get(rel) || 0) + c); }
    }
  }
}

console.log("  " + "probe".padEnd(26) + "CODE".padStart(9) + "  cf" + "   LOCALE".padStart(8) + "  lf");
for (const pair of compiled) {
  const l = pair[0];
  const ct = codeTot.get(l), lt = locTot.get(l);
  console.log("  " + l.padEnd(26) + String(ct).padStart(9) + "  " + String(codeHit.get(l).size).padStart(4) +
              "   " + String(lt).padStart(8) + "  " + String(locHit.get(l).size).padStart(4));
}

console.log("");
console.log("== CODE-ONLY per-file detail for the decisive probes");
for (const l of ["MediaRecorder", "getUserMedia", "AudioContext", "audioWorklet", "createMediaStreamSource", "speechSynthesis", "SpeechRecognition", "interimResults"]) {
  const h = codeHit.get(l);
  console.log("");
  console.log("  -- " + l + " (code, total " + codeTot.get(l) + ", files " + h.size + ")");
  const top = Array.from(h.entries()).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 10);
  for (const e of top) console.log("       " + e[0].padEnd(64) + e[1]);
}
console.log("");
console.log("DONE");