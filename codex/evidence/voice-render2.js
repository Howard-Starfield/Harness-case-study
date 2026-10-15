"use strict";
// Single-pass renderer voice census. Reads each file ONCE, tests all probes on the
// same string. Equivalent method to voice-render.js (13 passes) but 13x less I/O.
const fs = require("fs");
const SRC = process.env.TEMP + "\\codex-src";
const W = SRC + "\\webview";
const EQ = "=".repeat(76);
function hdr(t) { console.log("\n" + EQ + "\n== " + t + "\n" + EQ); }

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

// Probe list: [label, regex source, flags]
const PROBE_SRC = [
  ["SpeechRecognition",        "\\b(?:webkit)?SpeechRecognition\\b", "gi"],
  ["speechSynthesis",         "\\bspeechSynthesis\\b", "g"],
  ["SpeechSynthesisUtterance","SpeechSynthesisUtterance", "g"],
  ["MediaRecorder",           "\\bMediaRecorder\\b", "g"],
  ["getUserMedia",            "getUserMedia", "g"],
  ["AudioContext",            "\\b(?:webkit)?AudioContext\\b", "gi"],
  ["OfflineAudioContext",     "OfflineAudioContext", "g"],
  ["createMediaStreamSource", "createMediaStreamSource|createMediaStreamTracks", "g"],
  ["interimResults",          "\\binterimResults\\b", "g"],
  ["onboundary",              "onboundary|speech-boundary", "g"],
  ["dictation",               "\\bdictation\\w*", "gi"],
  ["voice",                   "\\bvoic\\w+", "gi"],
  ["microphone",              "\\bmicrophone\\w*", "gi"],
  ["audio",                   "\\baudios?\\b", "gi"],
  ["CONTROL ipcBridge",       "\\bipcBridge\\b", "g"],
  ["CONTROL useState",        "useState", "g"],
  ["CONTROL realtimeVoice",   "realtimeVoice", "g"],
  ["CONTROL audioWorklet",    "audioWorklet|AudioWorklet", "g"],
];

const compiled = PROBE_SRC.map(function (p) {
  return [p[0], new RegExp(p[1], p[2])];
});

const totals = new Map();
const hits = new Map();   // label -> Map(relpath -> count)
for (const c of compiled) { totals.set(c[0], 0); hits.set(c[0], new Map()); }

// Also: record which files mention dictation/voice at all, for later context reads.
let done = 0;
for (const f of files) {
  let t;
  try { t = fs.readFileSync(f, "utf8"); } catch { continue; }
  const rel = f.slice(SRC.length + 1).replace(/\\/g, "/");
  for (const pair of compiled) {
    const re = pair[1];
    re.lastIndex = 0;
    const m = t.match(re);
    if (m && m.length) {
      totals.set(pair[0], totals.get(pair[0]) + m.length);
      const hm = hits.get(pair[0]);
      hm.set(rel, (hm.get(rel) || 0) + m.length);
    }
  }
  done++;
  if (done % 2000 === 0) console.error("  ... " + done + "/" + files.length);
}

hdr("RENDER VOICE CENSUS (occurrences, one pass)");
for (const pair of compiled) {
  const label = pair[0];
  const n = totals.get(label);
  const hm = hits.get(label);
  console.log("  " + label.padEnd(26) + String(n).padStart(8) + "   files=" + hm.size);
  const top = Array.from(hm.entries()).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 6);
  for (const e of top) console.log("        " + e[0].padEnd(60) + e[1]);
}

console.log("\nDONE");