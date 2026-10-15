"use strict";
// The renderer is where Web Speech / MediaRecorder / getUserMedia must live.
// MAIN had 0 for all of them, which is correct. Scan RENDER with positive controls.
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
console.log("RENDER corpus: " + files.length.toLocaleString() + " files, " + bytes.toLocaleString() + " bytes");

const PROBES = {
  "SpeechRecognition":  /\b(?:webkit)?SpeechRecognition\b/g,
  "speechSynthesis":   /\bspeechSynthesis\b/g,
  "SpeechSynthesisUtterance": /SpeechSynthesisUtterance/g,
  "MediaRecorder":     /\bMediaRecorder\b/g,
  "getUserMedia":      /getUserMedia/g,
  "AudioContext":      /\b(?:webkit)?AudioContext\b/g,
  "createMediaStream": /createMediaStreamSource|createMediaStreamTracks/g,
  "continuous/interim":/\binterimResults\b|\bcontinuous\b/g,
  "dictation":         /\bdictation\w*/gi,
  "voice":             /\bvoic\w+/gi,
  "audio":             /\baudios?\b/gi,
  "CONTROL ipcBridge": /\bipcBridge\b/g,
  "CONTROL react":     /useState|useEffect/g,
};

for (const label of Object.keys(PROBES)) {
  const re = PROBES[label];
  let n = 0;
  const hit = new Map();
  for (const f of files) {
    const t = fs.readFileSync(f, "utf8");
    re.lastIndex = 0;
    const c = (t.match(re) || []).length;
    if (c) { n += c; const r = f.slice(SRC.length + 1).replace(/\\/g, "/"); hit.set(r, (hit.get(r) || 0) + c); }
  }
  console.log("  " + label.padEnd(26) + String(n).padStart(7) + "   files=" + hit.size);
  const top = Array.from(hit.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  for (const [f, c] of top) console.log("        " + f.padEnd(58) + c);
}