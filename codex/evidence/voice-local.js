"use strict";
// Settle the "is there a LOCAL model" question with file-extension evidence, and
// get exact char counts for the corpora. Positive controls included: if the
// extension scanner reports 0 for .onnx we expect >0, proving the scanner works.
const fs = require("fs");
const SRC = process.env.TEMP + "\\codex-src";
const EQ = "=".repeat(78);
function hdr(t) { console.log("\n" + EQ + "\n== " + t + "\n" + EQ); }

const all = [];
(function walk(d) {
  let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = d + "\\" + e.name;
    if (e.isDirectory()) walk(p); else all.push(p);
  }
})(SRC);

hdr("EXTENSION INVENTORY (whole extracted tree)");
const byExt = new Map();
for (const f of all) {
  const b = f.slice(f.lastIndexOf("\\") + 1);
  const i = b.lastIndexOf(".");
  const ext = i <= 0 ? "(no extension)" : b.slice(i).toLowerCase();
  let e = byExt.get(ext);
  if (!e) { e = { n: 0, b: 0 }; byExt.set(ext, e); }
  e.n++; e.b += fs.statSync(f).size;
}
const modelExts = [".onnx", ".ort", ".tflite", ".pt", ".pth", ".gguf", ".ggml", ".bin", ".safetensors", ".mlmodel", ".pb", ".tflite", ".params", ".caffemodel", ".weights"];
console.log("  total files: " + all.length.toLocaleString());
console.log("");
console.log("  ML / model container extensions:");
let modelFound = 0;
for (const me of modelExts) {
  const e = byExt.get(me);
  if (e) { modelFound += e.n; console.log("    " + me.padEnd(16) + String(e.n).padStart(5) + " files  " + e.b.toLocaleString().padStart(12) + " bytes"); }
}
if (!modelFound) console.log("    (none of the probed ML extensions appear anywhere in the tree)");

hdr("WASM INVENTORY (all .wasm files, with size + first identifying literal)");
const wasms = all.filter(function (f) { return f.toLowerCase().endsWith(".wasm"); });
console.log("  count=" + wasms.length);
for (const w of wasms.sort(function (a, b) { return fs.statSync(b).size - fs.statSync(a).size; })) {
  const sz = fs.statSync(w).size;
  let hint = "";
  try {
    const buf = fs.readFileSync(w);
    // Probe for identifying ASCII markers in the first 64KB.
    const head = buf.slice(0, 65536).toString("latin1");
    const markers = ["ort-wasm", "onnxruntime", "silero", "silero_vad", "vad", "jitsi", "whisper", "emscripten", "EMSCRIPTEN"];
    for (const mk of markers) if (head.indexOf(mk) >= 0) { hint = mk; break; }
  } catch { hint = "(read error)"; }
  console.log("    " + String(sz).padStart(10) + "  " + (hint ? "[" + hint + "] " : "") +
              w.slice(SRC.length + 1).replace(/\\/g, "/"));
}

hdr("DATA / MTS INVENTORY");
for (const ext of [".data", ".mts"]) {
  const hits = all.filter(function (f) { return f.toLowerCase().endsWith(ext); });
  console.log("  " + ext + "  count=" + hits.length);
  for (const h of hits.sort(function (a, b) { return fs.statSync(b).size - fs.statSync(a).size; }).slice(0, 12)) {
    console.log("    " + String(fs.statSync(h).size).padStart(10) + "  " + h.slice(SRC.length + 1).replace(/\\/g, "/"));
  }
}

hdr("LOCAL-STT / LOCAL-LLM ENGINE NAME SCAN (code corpus only, raw decoded text)");
const codeFiles = [];
const MAIN = SRC + "\\.vite\\build";
const WEB = SRC + "\\webview";
function collectJS(dir, out) {
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = dir + "\\" + e.name;
    if (e.isDirectory()) collectJS(p, out);
    else if (/\.(js|mjs|cjs)$/i.test(e.name)) out.push(p);
  }
}
collectJS(MAIN, codeFiles);
collectJS(WEB, codeFiles);
const LOCALE_RE = /^[a-z]{2,3}(-[A-Za-z]{2,4})?-[0-9a-f]{8,}\.js$/i;
const nonLocale = codeFiles.filter(function (f) {
  return !LOCALE_RE.test(f.slice(f.lastIndexOf("\\") + 1));
});
console.log("  code corpus: files=" + nonLocale.length);
const NEEDLES = {
  "whisper": /\bwhisper\w*/gi,
  "vosk": /\bvosk\w*/gi,
  "onnxruntime (control)": /onnxruntime/gi,
  "ort- (control)": /\bort-wasm/gi,
  "wav2vec": /wav2vec/gi,
  "deepspeech": /deepspeech/gi,
  "pocketsphinx": /pocketsphinx/gi,
  "speech_recognition": /speech_recognition/gi,
  "sherpa": /sherpa/gi,
  "transformers.js": /@xenova|transformers\.js|onnxruntime-web/gi,
  "webllm": /webllm|web-llm/gi,
  "transformers pipeline": /pipeline\s*\(\s*['"]automatic-speech/gi,
  "llama.cpp": /llama\.cpp|ggml/gi,
  "ollama": /\bollama\b/gi,
  "lm studio": /lm\s*studio|lmstudio/gi,
  "local model slug (control)": /setLocalModelSlug|localModelSlug/gi,
  "CONTROL useState": /useState/g,
};
function countAll(text, re) {
  re.lastIndex = 0; let n = 0;
  while (re.exec(text) !== null) { n++; if (re.lastIndex === 0) break; }
  return n;
}
for (const k of Object.keys(NEEDLES)) {
  const re = NEEDLES[k];
  let tot = 0; const hitF = new Map();
  for (const f of nonLocale) {
    let t; try { t = fs.readFileSync(f, "utf8"); } catch { continue; }
    const c = countAll(t, re);
    if (c) { tot += c; const r = f.slice(SRC.length + 1).replace(/\\/g, "/"); hitF.set(r, (hitF.get(r) || 0) + c); }
  }
  console.log("  " + k.padEnd(26) + String(tot).padStart(6) + "  files=" + hitF.size);
  const top = Array.from(hitF.entries()).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 3);
  for (const e of top) console.log("        " + e[0].padEnd(62) + e[1]);
}

hdr("EXACT CHAR COUNTS (decoded text, UTF-16 code units)");
function countJS(dir) {
  let files = 0, bytes = 0, chars = 0;
  collectJS(dir, []);
  const list = [];
  collectJS(dir, list);
  for (const f of list) {
    const b = fs.statSync(f).size;
    let t; try { t = fs.readFileSync(f, "utf8"); } catch { continue; }
    files++; bytes += b; chars += t.length;
  }
  return { files, bytes, chars };
}
const m = countJS(MAIN);
console.log("  MAIN (.vite/build)  files=" + m.files + "  bytes=" + m.bytes.toLocaleString() + "  chars=" + m.chars.toLocaleString());
const webList = [];
collectJS(WEB, webList);
let cf = 0, cb = 0, cc = 0, lf = 0, lb = 0, lc = 0;
for (const f of webList) {
  const b = fs.statSync(f).size;
  let t; try { t = fs.readFileSync(f, "utf8"); } catch { continue; }
  if (LOCALE_RE.test(f.slice(f.lastIndexOf("\\") + 1))) { lf++; lb += b; lc += t.length; }
  else { cf++; cb += b; cc += t.length; }
}
console.log("  RENDER code          files=" + cf + "  bytes=" + cb.toLocaleString() + "  chars=" + cc.toLocaleString());
console.log("  RENDER locale        files=" + lf + "  bytes=" + lb.toLocaleString() + "  chars=" + lc.toLocaleString());
console.log("  RENDER total         files=" + (cf + lf) + "  bytes=" + (cb + lb).toLocaleString() + "  chars=" + (cc + lc).toLocaleString());
console.log("");
console.log("DONE");