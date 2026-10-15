"use strict";
// ADVERSARIAL ATTACK ON MY OWN HEADLINE NEGATIVE (F5 / report 02-2.5).
// Claim: `elevation_service` appears 0 times in 14,816 JS files (MAIN+RENDER), therefore
// an unprivileged renderer cannot reach it. Try to BREAK that claim from several angles.
const fs = require("fs");
const path = require("path");
const SRC = path.join(process.env.TEMP, "codex-src");
const EQ = "=".repeat(74);
function hdr(t) { console.log("\n" + EQ + "\n== " + t + "\n" + EQ); }

function walk(d, out = []) {
  let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const ALL = walk(SRC);
console.log("total files in extracted tree: " + ALL.length);

const byExt = new Map();
for (const p of ALL) {
  const m = /\.([A-Za-z0-9]+)$/.exec(p);
  const e = m ? m[1].toLowerCase() : "(noext)";
  byExt.set(e, (byExt.get(e) || 0) + 1);
}
console.log("extensions present: " + Array.from(byExt.entries()).sort((a,b)=>b[1]-a[1])
  .slice(0,18).map(([k,v])=>k+"="+v).join("  "));

// ---- ANGLE 1: excluded file types. Did I miss a whole class? ----
hdr("ANGLE 1 - lift the exclusions: .json / .wasm / .c / .h / .wasm / .node / no-ext");
const NEEDLE = /elevation_service/gi;
const GROUPS = {
  "json (locales+data)": /\.json$/i,
  "wasm": /\.wasm$/i,
  "c/h (shipped sources)": /\.[ch]$/i,
  "no-extension": /(?<!\.[A-Za-z0-9]+)$/,
  "data": /\.data$/i,
};
for (const [label, re] of Object.entries(GROUPS)) {
  let files = 0, hits = 0, bytes = 0; const where = [];
  for (const p of ALL) {
    if (!re.test(p)) continue;
    files++;
    let t; try { t = fs.readFileSync(p, "utf8"); } catch { continue; }
    bytes += Buffer.byteLength(t, "utf8");
    NEEDLE.lastIndex = 0;
    const c = (t.match(NEEDLE) || []).length;
    if (c) { hits += c; if (where.length < 6) where.push(path.relative(SRC, p).replace(/\\/g,"/") + "(" + c + ")"); }
  }
  console.log("  " + label.padEnd(24) + " files=" + String(files).padStart(6) +
    "  bytes=" + String(bytes).padStart(13) + "  hits=" + hits + (where.length ? "  " + where.join(", ") : ""));
}

// ---- ANGLE 2: indirect / encoded construction ----
hdr("ANGLE 2 - indirect + encoded constructions (JS corpus only)");
function walkJs(d, out = []) {
  let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walkJs(p, out);
    else if (/\.(js|mjs|cjs)$/i.test(e.name)) out.push(p);
  }
  return out;
}
const JS = walkJs(path.join(SRC, ".vite", "build")).concat(walkJs(path.join(SRC, "webview")));
console.log("  JS corpus: " + JS.length + " files");

const b64 = Buffer.from("elevation_service").toString("base64");      // "ZWxldmF0aW9uX3NlcnZpY2U="
const b64url = Buffer.from("elevation_service").toString("base64url");
const hexs = Array.from(Buffer.from("elevation_service")).map((b) => "\\x" + b.toString(16).padStart(2,"0")).join("");
const codes = Array.from("elevation_service").map((c) => c.charCodeAt(0)).join(",");
const probes = {
  "plain literal (control)": /elevation_service/gi,
  "case-insensitive literal (control)": /ELEVATION_SERVICE/gi,
  "base64 standard": new RegExp(b64.replace(/[+/=]/g, (c) => "\\" + c), "gi"),
  "base64url": new RegExp(b64url.replace(/[-_]/g, (c) => "\\" + c), "gi"),
  "hex-escaped, no separators": new RegExp(hexs, "gi"),
  "hex-escaped, any separators": new RegExp(Array.from(Buffer.from("elevation_service"))
      .map((b) => "\\x" + b.toString(16).padStart(2, "0")).join("[" + "'\\s+," + "]{0,2}"), "gi"),
  "char-code sequence": new RegExp(codes.split(",").join("[,\\s]{0,2}"), "g"),
  "split literal  elevat + ion_service": /elevat\s*\+\s*[`'"]ion_/gi,
  "split literal  elevation + _service": /elevation\s*\+\s*[`'"]_service/gi,
  "template concat via var": /elevation[^a-zA-Z0-9]{0,20}_service/gi,
  "elevator (alt spelling)": /elevator/gi,
  "ShellExecuteEx": /ShellExecuteEx/gi,
  "runas verb (\\brunas\\b)": /\brunas\b/gi,
  "CONTROL: ipcRenderer": /ipcRenderer/g,
  "CONTROL: codex-windows-sandbox": /codex-windows-sandbox/gi,
};
for (const [label, re] of Object.entries(probes)) {
  let n = 0; const fs2 = new Set();
  for (const p of JS) {
    const t = fs.readFileSync(p, "utf8");
    re.lastIndex = 0;
    const c = (t.match(re) || []).length;
    if (c) { n += c; fs2.add(path.relative(SRC, p).replace(/\\/g, "/")); }
  }
  console.log("  " + label.padEnd(36) + String(n).padStart(7) + "  files=" + fs2.size);
}

// ---- ANGLE 3: what DOES the JS corpus name as executables? ----
hdr("ANGLE 3 - every *.exe literal in the JS corpus (what can JS even name?)");
const exeRe = /([A-Za-z0-9_.-]{2,40}\.exe)/gi;
const exes = new Map();
for (const p of JS) {
  const t = fs.readFileSync(p, "utf8");
  exeRe.lastIndex = 0; let m;
  while ((m = exeRe.exec(t)) !== null) {
    const k = m[1].toLowerCase();
    exes.set(k, (exes.get(k) || 0) + 1);
  }
}
const rows = [...exes.entries()].sort((a, b) => b[1] - a[1]);
console.log("  distinct .exe literals: " + rows.length);
for (const [k, v] of rows.slice(0, 40)) console.log("    " + k.padEnd(46) + v);