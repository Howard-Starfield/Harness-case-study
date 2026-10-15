"use strict";
// Codex IPC + elevation reachability — FULL corpus.
// IMPORTANT CORRECTION: the first pass scanned only .vite/build (34 files,
// the MAIN process). The RENDERER lives in webview/assets (20,119 .js files).
// Every count here states which corpus it covers.
const fs = require("fs");
const path = require("path");
const SRC = path.join(process.env.TEMP, "codex-src");

function walk(d, out = []) {
  let ents;
  try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(js|mjs|cjs)$/i.test(e.name)) out.push(p);
  }
  return out;
}

const MAIN = walk(path.join(SRC, ".vite", "build"));
const RENDER = walk(path.join(SRC, "webview"));

const sizeOf = (files) => files.reduce((a, f) => a + fs.statSync(f).size, 0);

console.log("=== CORPUS ===");
console.log(`MAIN    .vite/build : ${MAIN.length} files, ${sizeOf(MAIN).toLocaleString()} bytes`);
console.log(`RENDER  webview/**  : ${RENDER.length} files, ${sizeOf(RENDER).toLocaleString()} bytes`);
console.log(`TOTAL                : ${MAIN.length + RENDER.length} files, ${(sizeOf(MAIN) + sizeOf(RENDER)).toLocaleString()} bytes`);
console.log(`corpus scope: CODE only; locale .json EXCLUDED; raw text, not an encoded string pool`);

// ---- byte+char counts (G9) ----
let bAll = 0, cAll = 0, nonAscii = 0;
for (const f of MAIN.concat(RENDER)) {
  const t = fs.readFileSync(f, "utf8");
  bAll += Buffer.byteLength(t, "utf8");
  cAll += t.length;
  if (Buffer.byteLength(t, "utf8") !== t.length) nonAscii++;
}
console.log(`\nbyte total : ${bAll.toLocaleString()}`);
console.log(`char total : ${cAll.toLocaleString()}`);
console.log(`byte == char: ${bAll === cAll}   (files with multi-byte UTF-8: ${nonAscii})`);

const NEEDLES = {
  "elevation_service": /elevation_service/gi,
  "elevator": /elevator/gi,
  "runas": /runas/gi,
  "ShellExecuteEx": /ShellExecuteEx/gi,
  "elevation (any)": /elevat/gi,
  "sandbox-setup bin": /sandbox-setup/gi,
  "sandbox-service bin": /sandbox-service/gi,
  "codex-windows-sandbox": /codex-windows-sandbox/gi,
  "command-runner": /command-runner/gi,
  "ipcRenderer": /ipcRenderer/g,
  "ipcMain": /ipcMain/g,
  "contextBridge": /contextBridge/g,
  "exposeInMainWorld": /exposeInMainWorld/g,
  "webPreferences": /webPreferences/g,
  "nodeIntegration": /nodeIntegration/g,
  "contextIsolation": /contextIsolation/g,
  "sandbox: literal": /sandbox\s*:\s*(!0|!1|true|false)/g,
  "webSecurity": /webSecurity\s*:\s*(!0|!1|true|false)/g,
  "no-sandbox": /no-sandbox/gi,
  "appContainer / contained": /AppContainer|contained|packageIdentity/i,
};

console.log(`\n=== OCCURRENCE CENSUS (G6: occurrences, not lines) ===`);
console.log(`${"pattern".padEnd(26)} ${"MAIN".padStart(8)} ${"RENDER".padStart(8)} ${"TOTAL".padStart(8)}  files(main/render)`);
const results = {};
for (const [label, re] of Object.entries(NEEDLES)) {
  let m = 0, r = 0;
  const fm = new Set(), fr = new Set();
  for (const f of MAIN) {
    const t = fs.readFileSync(f, "utf8");
    re.lastIndex = 0;
    const c = (t.match(re) || []).length;
    if (c) { m += c; fm.add(path.relative(SRC, f).replace(/\\/g, "/")); }
  }
  for (const f of RENDER) {
    const t = fs.readFileSync(f, "utf8");
    re.lastIndex = 0;
    const c = (t.match(re) || []).length;
    if (c) { r += c; fr.add(path.relative(SRC, f).replace(/\\/g, "/")); }
  }
  results[label] = { main: m, render: r, total: m + r, mainFiles: fm.size, renderFiles: fr.size };
  console.log(`${label.padEnd(26)} ${String(m).padStart(8)} ${String(r).padStart(8)} ${String(m + r).padStart(8)}  ${fm.size}/${fr.size}`);
}

fs.writeFileSync(path.join(__dirname, "codex-census.json"), JSON.stringify({
  corpus: { main: { files: MAIN.length, bytes: sizeOf(MAIN) }, render: { files: RENDER.length, bytes: sizeOf(RENDER) },
            bytes: bAll, chars: cAll, byteEqChar: bAll === cAll, nonAsciiFiles: nonAscii },
  census: results,
}, null, 2));
console.log("\nwrote codex-census.json");
