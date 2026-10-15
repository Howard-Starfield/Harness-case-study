"use strict";
// Single-pass renderer voice census, v3.
// Fixes vs v2: (a) progress goes to STDOUT only, never stderr (PowerShell's
// $ErrorActionPreference='Stop' kills the node process on any native stderr write),
// (b) counting uses a manual exec loop so no match() arrays are ever materialised
// (the renderer has very large chunks; match() on them allocates millions of strings).
const fs = require("fs");
const SRC = process.env.TEMP + "\\codex-src";
const W = SRC + "\\webview";
const EQ = "=".repeat(76);

const files = [];
(function walk(d) {
  let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = d + "\\" + e.name;
    if (e.isDirectory()) walk(p);
    else if (/\.(js|mjs|cjs)$/i.test(e.name)) files.push(p);
  }
})(W);
let bytes = 0;
for (const f of files) bytes += fs.statSync(f).size;
console.log("RENDER corpus (one pass): " + files.length.toLocaleString() + " files, " +
            bytes.toLocaleString() + " bytes");
console.log("Note: occurrence counts, not line counts. Chars are UTF-16 code units of decoded text.");

const PROBE_SRC = [
  ["SpeechRecognition",         "\\b(?:webkit)?SpeechRecognition\\b", "gi"],
  ["speechSynthesis",          "\\bspeechSynthesis\\b", "g"],
  ["SpeechSynthesisUtterance", "SpeechSynthesisUtterance", "g"],
  ["MediaRecorder",            "\\bMediaRecorder\\b", "g"],
  ["getUserMedia",             "getUserMedia", "g"],
  ["AudioContext",             "\\b(?:webkit)?AudioContext\\b", "gi"],
  ["OfflineAudioContext",      "OfflineAudioContext", "g"],
  ["createMediaStreamSource",  "createMediaStreamSource|createMediaStreamTracks", "g"],
  ["interimResults",           "\\binterimResults\\b", "g"],
  ["onboundary",               "onboundary|speech-boundary", "g"],
  ["dictation",                "\\bdictation\\w*", "gi"],
  ["voice",                    "\\bvoic\\w+", "gi"],
  ["microphone",               "\\bmicrophone\\w*", "gi"],
  ["audio",                    "\\baudios?\\b", "gi"],
  ["CONTROL ipcBridge",        "\\bipcBridge\\b", "g"],
  ["CONTROL useState",         "useState", "g"],
  ["CONTROL realtimeVoice",    "realtimeVoice", "g"],
  ["CONTROL audioWorklet",     "udioWorklet", "g"],
];

// Count occurrences without building a result array.
function countAll(text, re) {
  re.lastIndex = 0;
  let n = 0;
  while (re.exec(text) !== null) {
    n++;
    if (re.lastIndex === 0) break;   // zero-length match guard
  }
  return n;
}

const compiled = PROBE_SRC.map(function (p) { return [p[0], new RegExp(p[1], p[2])]; });
const totals = new Map();
const hits = new Map();
for (const c of compiled) { totals.set(c[0], 0); hits.set(c[0], new Map()); }

let done = 0;
for (const f of files) {
  let t;
  try { t = fs.readFileSync(f, "utf8"); } catch { continue; }
  const rel = f.slice(SRC.length + 1).replace(/\\/g, "/");
  for (const pair of compiled) {
    const c = countAll(t, pair[1]);
    if (c > 0) {
      totals.set(pair[0], totals.get(pair[0]) + c);
      const hm = hits.get(pair[0]);
      hm.set(rel, (hm.get(rel) || 0) + c);
    }
  }
  done++;
  if (done % 2000 === 0) {
    console.log("  progress " + done + "/" + files.length);
  }
}

console.log("");
console.log(EQ);
console.log("== RENDER VOICE CENSUS (occurrences, single pass, raw decoded JS text)");
console.log(EQ);
for (const pair of compiled) {
  const label = pair[0];
  const hm = hits.get(label);
  console.log("  " + label.padEnd(26) + String(totals.get(label)).padStart(8) + "   files=" + hm.size);
  const top = Array.from(hm.entries()).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 6);
  for (const e of top) console.log("        " + e[0].padEnd(62) + e[1]);
}
console.log("");
console.log("DONE");