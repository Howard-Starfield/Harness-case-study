"use strict";
// Is elevation_service.exe OpenAI's own code or upstream Chromium's?
// Evidence: source paths, symbols, and whether the elevation service is
// REFERENCED BY THE VENDOR JS (i.e. actually reachable from the app).
const fs = require("fs");
const path = require("path");
const ROOT = "C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.1007.2314.0_x64__2p2nqsd0c76g0\\app";

function runs(buf, min = 5) {
  const out = new Set(); let cur = "";
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i];
    if (c >= 0x20 && c < 0x7f) cur += String.fromCharCode(c);
    else { if (cur.length >= min) out.add(cur); cur = ""; }
  }
  return [...out];
}

const out = [];
const P = (s = "") => out.push(s);

P("=== A. elevation_service.exe provenance ===");
{
  const buf = fs.readFileSync(path.join(ROOT, "elevation_service.exe"));
  const all = runs(buf, 4);
  const srcPaths = [...new Set(all.filter((s) => /^[.]{0,2}\\\\?\.{0,2}[\w\\/.]+\.(cc|h|cpp)$/.test(s) || /chrome[\\/]elevation/.test(s)))];
  P(`  source paths (${srcPaths.length}):`);
  for (const s of srcPaths.slice(0, 40)) P("    " + s);
  const dirs = [...new Set(all.filter((s) => /^[.]{0,2}\\\\[\\\/]?[a-z_]+[\\/]/.test(s)).map((s) => s.split(/[\\/]/).slice(0, 4).join("\\")))];
  P(`  distinct source directories (${dirs.length}):`);
  for (const d of dirs.slice(0, 25)) P("    " + d);
  const isChromium = all.some((s) => /chrome[\\/]elevation_service/.test(s));
  P(`  contains 'chrome\\elevation_service' source paths: ${isChromium}`);
  P(`  contains OpenAI/Codex-specific source paths: ${all.some((s) => /codex|openai|oai/i.test(s) && /\.(cc|h|cpp)$/.test(s))}`);
  // toolchain
  const isRust = all.some((s) => /rustc|cargo|registry[\\/]src/i.test(s));
  const hasPdb = all.some((s) => /\.pdb$/i.test(s));
  P(`  rust markers: ${isRust}   pdb name present: ${hasPdb}`);
}

P("\n=== B. sandbox binaries: toolchain + provenance ===");
for (const rel of ["resources\\codex-windows-sandbox-service.exe", "resources\\codex-windows-sandbox-setup.exe", "resources\\codex.exe", "resources\\codex-command-runner.exe", "resources\\codex-code-mode-host.exe"]) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) { P(`\n  ${rel}: MISSING`); continue; }
  const buf = fs.readFileSync(p);
  const all = runs(buf, 5);
  const rustSrc = [...new Set(all.filter((s) => /^[\w\\/-]+\.rs$/.test(s)))];
  const cppSrc = [...new Set(all.filter((s) => /^[\w\\/-]+\.(cc|cpp|h)$/.test(s)))];
  const goPaths = [...new Set(all.filter((s) => /^[A-Z]:\\[\w\\/.-]+\.go$/.test(s) || /^[a-z-]+\/[a-z\/.-]+\.go$/.test(s)))];
  const goVer = all.find((s) => /^go1\.\d+(\.\d+)?$/.test(s));
  P(`\n  --- ${rel} (${buf.length.toLocaleString()} B) ---`);
  P(`    go1.x marker : ${goVer || "-"}`);
  P(`    .rs sources  : ${rustSrc.length}   .cc/.cpp/.h sources: ${cppSrc.length}   .go sources: ${goPaths.length}`);
  const roots = new Set();
  for (const s of [...rustSrc, ...cppSrc, ...goPaths]) {
    const parts = s.split(/[\\/]/);
    if (parts.length >= 3) roots.add(parts.slice(0, 3).join("/"));
  }
  for (const r of [...roots].slice(0, 12)) P("      " + r);
}

P("\n=== C. is elevation reachable from vendor JS? ===");
{
  const SRC = path.join(process.env.TEMP, "codex-src");
  const buildDir = path.join(SRC, ".vite", "build");
  const files = [];
  (function walk(d) {
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n);
      const st = fs.statSync(p);
      if (st.isDirectory()) { if (d !== SRC || n === ".vite") walk(p); }
      else if (/\.(js|mjs|cjs)$/i.test(n)) files.push(p);
    }
  })(SRC);

  P(`  corpus: ${files.length} .js/.mjs files under %TEMP%\\codex-src\\.vite`);
  const NEEDLES = ["elevation_service", "elevator", "runas", "ShellExecuteEx", "isElevated", "elevat"];
  const census = new Map(NEEDLES.map((n) => [n, []]));
  for (const f of files) {
    let t;
    try { t = fs.readFileSync(f, "utf8"); } catch { continue; }
    const rel = path.relative(SRC, f).replace(/\\/g, "/");
    for (const n of NEEDLES) {
      let c = 0, i = -1;
      while ((i = t.indexOf(n, i + 1)) >= 0) c++;
      if (c) census.get(n).push({ rel, c });
    }
  }
  for (const [n, list] of census) {
    const tot = list.reduce((a, x) => a + x.c, 0);
    P(`\n  "${n}" -> ${tot} occurrences across ${list.length} files`);
    for (const x of list.sort((a, b) => b.c - a.c).slice(0, 6)) P(`      ${String(x.c).padStart(4)}  ${x.rel}`);
  }
  // context around a real hit
  for (const f of files) {
    let t; try { t = fs.readFileSync(f, "utf8"); } catch { continue; }
    const i = t.toLowerCase().indexOf("elevat");
    if (i >= 0 && t.toLowerCase().includes("elevationservice")) {
      P(`\n  ---- context in ${path.relative(SRC, f).replace(/\\/g, "/")} @${i} ----`);
      P("  " + t.slice(Math.max(0, i - 500), i + 500).replace(/\s+/g, " "));
      break;
    }
  }
}

fs.writeFileSync(path.join(__dirname, "elevation-deep.txt"), out.join("\n"));
console.log(out.join("\n"));
