"use strict";
// Codex: privilege-boundary extraction.
// 1. Every webPreferences object literal and its security flags.
// 2. Every `sandbox:` literal with its value.
// 3. HRESULT decode for the update-elevation gate.
// 4. The Windows sandbox setup orchestration (elevated/unelevated/timeout).
// 5. The single `elevator` hit in the renderer corpus.
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

// ---------- 3. HRESULT ----------
console.log("=".repeat(78));
console.log("== HRESULT DECODE (update-elevation gate)");
console.log("=".repeat(78));
const hr = 2147958056;
const hex = (hr >>> 0).toString(16).padStart(8, "0");
console.log(`  decimal      : ${hr}`);
console.log(`  hex          : 0x${hex}`);
console.log(`  facility     : ${(hr >>> 16) & 0x7f}`);
console.log(`  severity     : ${(hr >>> 31) & 1}  (0=success,1=error)`);
console.log(`  NTSTATUS     : ${(hr & 0xffff) ? "0x" + (hr & 0xffff).toString(16) : "n/a"}`);
console.log(`  win32 code   : ${hr & 0xffff} (0x${(hr & 0xffff).toString(16)})`);
console.log(`  NOTE: check against Windows error tables before naming it.`);

// ---------- 1 + 2. webPreferences / sandbox literals ----------
console.log(`\n${"=".repeat(78)}\n== webPreferences OBJECT LITERALS (MAIN)\n${"=".repeat(78)}`);
const wpRe = /webPreferences\s*:\s*\{/g;
let wpCount = 0;
for (const f of MAIN) {
  const t = fs.readFileSync(f, "utf8");
  wpRe.lastIndex = 0;
  let m;
  while ((m = wpRe.exec(t)) !== null) {
    // balanced-brace walk from the '{'
    let i = m.index + m[0].length - 1, depth = 0, end = i;
    for (; end < t.length && end < m.index + 3000; end++) {
      if (t[end] === "{") depth++;
      else if (t[end] === "}") { depth--; if (depth === 0) { end++; break; } }
    }
    wpCount++;
    const body = t.slice(m.index, end);
    const rel = path.relative(SRC, f).replace(/\\/g, "/");
    console.log(`\n[${wpCount}] ${rel} @${m.index}`);
    console.log("    " + body.replace(/\s+/g, " ").slice(0, 700));
  }
}
console.log(`\n  TOTAL webPreferences literals in MAIN: ${wpCount} (of 15 'webPreferences' token hits)`);

console.log(`\n${"=".repeat(78)}\n== \`sandbox:\` LITERALS (MAIN)\n${"=".repeat(78)}`);
const sbRe = /sandbox\s*:\s*(!0|!1|true|false)/g;
let sb = 0;
for (const f of MAIN) {
  const t = fs.readFileSync(f, "utf8");
  sbRe.lastIndex = 0;
  let m;
  while ((m = sbRe.exec(t)) !== null) {
    sb++;
    const s = Math.max(0, m.index - 200), e = Math.min(t.length, m.index + 200);
    console.log(`\n[${sb}] ${path.relative(SRC, f).replace(/\\/g, "/")} @${m.index}  VALUE=${m[1]}`);
    console.log("    ..." + t.slice(s, e).replace(/\s+/g, " ") + "...");
  }
}
console.log(`\n  TOTAL \`sandbox:\` literals in MAIN: ${sb}`);

// ---------- 4. sandbox setup orchestration ----------
console.log(`\n${"=".repeat(78)}\n== WINDOWS SANDBOX SETUP ORCHESTRATION (src chunk)\n${"=".repeat(78)}`);
const target = MAIN.find((f) => f.endsWith("src-BJv5Mk7n.js"));
if (target) {
  const t = fs.readFileSync(target, "utf8");
  for (const [label, re, w] of [
    ["setupCompleted handler", /setupCompleted/g, 1400],
    ["timedOutWindowsSandboxSetup", /timedOutWindowsSandboxSetup/g, 900],
    ["windowsSandboxSetup / mode resolution", /windowsSandboxSetup/gi, 500],
    ["sandbox-setup spawn (iV list)", /iV\b|codex-windows-sandbox-setup/gi, 500],
    ["CODEX_WINDOWS_SANDBOX", /CODEX_WINDOWS_SANDBOX[A-Z_]*/g, 400],
  ]) {
    console.log(`\n--- ${label} ---`);
    re.lastIndex = 0;
    let m, n = 0;
    while ((m = re.exec(t)) !== null && n < 3) {
      n++;
      const s = Math.max(0, m.index - w / 2), e = Math.min(t.length, m.index + w / 2);
      console.log(`\n  [${n}] @${m.index} ${m[0]}`);
      console.log("    ..." + t.slice(s, e).replace(/\s+/g, " ") + "...");
    }
    if (n === 0) console.log("    (no hits)");
  }
}

// ---------- 5. renderer `elevator` ----------
console.log(`\n${"=".repeat(78)}\n== RENDERER \`elevator\` HIT (1 occurrence)\n${"=".repeat(78)}`);
const elRe = /elevator/gi;
let found = false;
for (const f of RENDER) {
  const t = fs.readFileSync(f, "utf8");
  elRe.lastIndex = 0;
  let m;
  while ((m = elRe.exec(t)) !== null) {
    found = true;
    const s = Math.max(0, m.index - 400), e = Math.min(t.length, m.index + 400);
    console.log(`\n  ${path.relative(SRC, f).replace(/\\/g, "/")} @${m.index}`);
    console.log("    ..." + t.slice(s, e).replace(/\s+/g, " ") + "...");
  }
}
if (!found) console.log("  (none on re-scan)");

fs.writeFileSync(path.join(__dirname, "privilege-boundary.txt"), "captured");