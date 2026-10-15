"use strict";
// Codex DISCOVERY pass: is there a voice/orb pipeline at all, and what are its parts?
// Count first, then read the hits. Avoid path.join (the writer has been dropping a paren).
const fs = require("fs");
const SRC = process.env.TEMP + "\\codex-src";
const B = SRC + "\\.vite\\build";
const EQ = "=".repeat(76);
function hdr(t) { console.log("\n" + EQ + "\n== " + t + "\n" + EQ); }

const files = fs.readdirSync(B).filter((f) => /\.(js|mjs)$/i.test(f));
const ALL = files.map((f) => ({ name: f, text: fs.readFileSync(B + "\\" + f, "utf8") }));
let bytes = 0, chars = 0;
for (const it of ALL) { bytes += Buffer.byteLength(it.text, "utf8"); chars += it.text.length; }
console.log("MAIN corpus: " + ALL.length + " files, " + bytes.toLocaleString() + " bytes / " + chars.toLocaleString() + " chars");

const PROBES = {
  "VOICE / STT": {
    "SpeechRecognition (api)": /\b(?:webkit)?SpeechRecognition\b/g,
    "speechSynthesis (api)":    /\bspeechSynthesis\b/g,
    "SpeechSynthesisUtterance": /SpeechSynthesisUtterance/g,
    "MediaRecorder":            /\bMediaRecorder\b/g,
    "getUserMedia":             /getUserMedia/g,
    "AudioContext":             /\bAudioContext\b|\bwebkitAudioContext\b/g,
    "transcri*":                /transcri\w*/gi,
    "whisper":                  /whisper/gi,
    "dictation":                /dictation/gi,
    "voice*":                   /\bvoic\w+/gi,
    "microphone":               /\bmicrophone\b|\bmicEnabled\b/g,
    "audio":                    /\baudios?\b/gi,
  },
  "ORB / UI": {
    "orb (word)":      /\borbs?\b/gi,
    "Orb<Cap>":        /Orb[A-Z]\w*/g,
    "voice-mode":      /voice-?mode/gi,
    "handsfree":       /hands-?free/gi,
  },
  "QUEUE / TURN": {
    "queued/queue*":   /\bqueued\b|\bqueue[A-Z]\w*/g,
    "enqueue*":        /\benqueue\w*/gi,
    "turn/started":    /turn\/started/g,
    "turn/completed":  /turn\/completed/g,
    "interrupt*":      /\binterrupt\w*/gi,
    "steer*":          /\bsteer\w*/gi,
    "followUp":        /follow-?[Uu]p/gi,
  },
  "MEMORY / MD": {
    "AGENTS.md":       /AGENTS\.md/g,
    "MEMORY.md":       /MEMORY\.md/g,
    "memory.md/json":  /memory\.(?:md|json)/gi,
    "todo/plan.md":    /todo[s]?\.md|plan\.md/gi,
    "memoryPipeline":  /memoryPipeline/g,
    "memory<Cap>":     /memory[A-Z]\w*/g,
  },
  "STREAMING": {
    "agentMessage/delta":  /item\/agentMessage\/delta/g,
    "reasoning/textDelta": /item\/reasoning\/textDelta/g,
    "outputDelta":         /outputDelta/g,
    "turn/diff/updated":   /turn\/diff\/updated/g,
    "chunk*":              /\bchunk\w*/gi,
  },
};

for (const group of Object.keys(PROBES)) {
  hdr(group);
  const probes = PROBES[group];
  for (const label of Object.keys(probes)) {
    const re = probes[label];
    let n = 0;
    const hit = new Set();
    for (const it of ALL) {
      re.lastIndex = 0;
      const c = (it.text.match(re) || []).length;
      if (c) { n += c; hit.add(it.name); }
    }
    console.log("  " + label.padEnd(28) + String(n).padStart(6) + "   files=" + hit.size +
      (hit.size ? "  [" + Array.from(hit).slice(0, 3).join(", ") + "]" : ""));
  }
}