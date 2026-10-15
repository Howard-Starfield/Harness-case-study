"use strict";
// Dump occurrence contexts for the security-relevant needles in the MAIN corpus.
// "0 hits" is never evidence of absence, so every positive gets its surrounding
// context printed and a negative gets a control-needle calibration.
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

const ctx = (t, i, w = 260) => {
  const s = Math.max(0, i - w), e = Math.min(t.length, i + w);
  return t.slice(s, e).replace(/\s+/g, " ");
};

function dump(label, re, limit = 40) {
  console.log(`\n${"=".repeat(78)}\n== ${label}\n${"=".repeat(78)}`);
  let n = 0;
  for (const f of MAIN) {
    const t = fs.readFileSync(f, "utf8");
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(t)) !== null) {
      n++;
      if (n > limit) { console.log(`  ... truncated at ${limit}`); return n; }
      const rel = path.relative(SRC, f).replace(/\\/g, "/");
      console.log(`\n[${n}] ${rel}  @char ${m.index}`);
      console.log(`    ...${ctx(t, m.index)}...`);
    }
  }
  console.log(`\n  TOTAL ${n} occurrence(s) in MAIN (${MAIN.length} files)`);
  return n;
}

// Control needles first: prove the scan is actually capable of finding things.
console.log(`### CONTROL NEEDLES (calibration) — MAIN ${MAIN.length} files`);
dump("CONTROL: __dirname (must be > 0)", /__dirname/g, 1);
dump("CONTROL: ipcRenderer (must be > 0)", /ipcRenderer/g, 1);

dump("codex-windows-sandbox-setup", /codex-windows-sandbox-setup/gi, 20);
dump("sandbox-setup", /sandbox-setup/gi, 20);
dump("elevat (all MAIN)", /elevat/gi, 40);
dump("runas (all MAIN)", /runas/gi, 20);
dump("ShellExecute / exec (elev-ish)", /ShellExecute|execFile|spawn\(/gi, 5);