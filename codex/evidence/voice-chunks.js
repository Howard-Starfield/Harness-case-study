"use strict";
// Profile every voice-related renderer chunk: API census + every distinctive string
// literal (protocols, URLs, event names, config keys, model names).
const fs = require("fs");
const SRC = process.env.TEMP + "\\codex-src";
const A = SRC + "\\webview\\assets";
const EQ = "=".repeat(78);

const TARGETS = [
  "horizon-voice-orb-controller-17a1ed1ea156.js",
  "voice-session-82332de4a122.js",
  "voice-session-parameters-e132baafb255.js",
  "voice-configuration-manager-9661addd95de.js",
  "voice-dsp-209836305db2.js",
  "dictation-audio-worklet-5c2f03781068.js",
  "realtime-buffered-audio-worklet-550138dc2d39.js",
  "vad-audio-frame-processor-b6bea101f49a.js",
  "silero-vad-4ab7157f46dc.js",
  "global-dictation-page-c8089ca3bf40.js",
  "chatgpt-voices-query-981094a5a8e1.js",
  "browser-voice-availability-bba9219a484f.js",
  "voice-prewarm-aeee0a038add.js",
  "realtime-voice-codex-status-signal-1cd1a86acfce.js",
  "realtime-voice-handoff-target-3c0ded48774f.js",
  "orbit-conversation-route-a41efc1dead8.js",
  "avatar-overlay-native-page-c254d4864d6b.js",
  "start-voice-afc5b690c3ab.js",
];

const API = [
  "AudioContext", "getUserMedia", "MediaRecorder", "WebSocket", "SpeechRecognition",
  "speechSynthesis", "createMediaStreamSource", "AudioWorklet", "Float32Array",
  "ScriptProcessor", "requestAnimationFrame", "createScriptProcessor", "WebAssembly",
  "SessionDescription", "RTCPeerConnection", "addTransceiver", "localDescription",
];

function countAll(text, re) {
  re.lastIndex = 0; let n = 0;
  while (re.exec(text) !== null) { n++; if (re.lastIndex === 0) break; }
  return n;
}

// Pull backtick / quote string literals. Minified bundles use backticks heavily.
function literals(t) {
  const out = new Set();
  const re = /`([^`\\]{3,120})`|'([^'\\]{3,120})'|"([^"\\]{3,120})"/g;
  let m;
  while ((m = re.exec(t)) !== null) {
    const s = m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3]);
    if (s === undefined) continue;
    // Keep only "interesting" literals: identifiers, protocol-ish, urls, events, keys.
    if (!/[A-Za-z]/.test(s)) continue;
    const interesting =
      /[a-z][A-Za-z0-9]*\.[A-Za-z][A-Za-z0-9]*\.[A-Za-z]/.test(s) ||      // a.b.c
      /^https?:/.test(s) || /^wss?:/.test(s) ||
      /^[a-z][a-z0-9]*(?:[-:.][a-z0-9]+)+$/i.test(s) ||                    // kebab/dotted ids
      /^[A-Z][A-Z0-9_]{3,}$/.test(s) ||
      /\b(realtime|dictation|silero|vad|transcri|synth|audio|orb|voice|hands[hake]off|microphone)\w*/i.test(s);
    if (interesting) out.add(s);
  }
  return Array.from(out);
}

for (const name of TARGETS) {
  const p = A + "\\" + name;
  let t;
  try { t = fs.readFileSync(p, "utf8"); } catch { console.log("MISSING " + name); continue; }
  console.log("");
  console.log(EQ);
  console.log("== " + name + "   bytes=" + t.length);
  console.log(EQ);
  const apis = [];
  for (const a of API) {
    const n = countAll(t, new RegExp("\\b" + a + "\\b", "g"));
    if (n) apis.push(a + "=" + n);
  }
  console.log("  API: " + (apis.length ? apis.join("  ") : "(none of the probed APIs)"));
  const lits = literals(t);
  // de-dup near-identicals and cap
  const seen = new Set();
  const keep = [];
  for (const s of lits) {
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    keep.push(s);
  }
  console.log("  literals(" + keep.length + "):");
  for (const s of keep.slice(0, 120)) console.log("    " + s);
  if (keep.length > 120) console.log("    ... +" + (keep.length - 120) + " more");
}
console.log("");
console.log("DONE");