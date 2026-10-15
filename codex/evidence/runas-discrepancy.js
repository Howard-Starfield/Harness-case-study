"use strict";
// Resolve the open discrepancy logged by the cancelled verifier:
// "the `runas` count mismatch (I get 121, report says 131)".
// Both were substring counts over the RENDER corpus. Establish which is which.
const fs = require("fs");
const path = require("path");
const SRC = path.join(process.env.TEMP, "codex-src");
const EQ = "=".repeat(74);
function hdr(t) { console.log("\n" + EQ + "\n== " + t + "\n" + EQ); }

function walkJs(d, out = []) {
  let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walkJs(p, out);
    else if (/\.(js|mjs|cjs)$/i.test(e.name)) out.push(p);
  }
  return out;
}
const MAIN = walkJs(path.join(SRC, ".vite", "build"));
const REND = walkJs(path.join(SRC, "webview"));
const ALL = MAIN.concat(REND);
console.log("MAIN=" + MAIN.length + " files, RENDER=" + REND.length + " files, total=" + ALL.length);

const VARIANTS = {
  "substring, case-SENSITIVE  /runas/g": /runas/g,
  "substring, case-INSENSITIVE /runas/gi": /runas/gi,
  "word-bounded, case-SENSITIVE  /\\brunas\\b/g": /\brunas\b/g,
  "word-bounded, case-INSENSITIVE /\\brunas\\b/gi": /\brunas\b/gi,
  "runAsync (the substring source)": /runAsync/g,
};

hdr("runas variant counts, split by corpus");
for (const [label, re] of Object.entries(VARIANTS)) {
  let m_ = 0, r_ = 0;
  for (const p of MAIN) { re.lastIndex = 0; m_ += (fs.readFileSync(p, "utf8").match(re) || []).length; }
  for (const p of REND) { re.lastIndex = 0; r_ += (fs.readFileSync(p, "utf8").match(re) || []).length; }
  console.log("  " + label.padEnd(44) + " MAIN=" + String(m_).padStart(4) + "  RENDER=" + String(r_).padStart(5) + "  TOTAL=" + (m_ + r_));
}

hdr("where the RENDER substring 'runas' occurrences actually live");
{
  const re = /runas/g;
  const bucket = new Map();
  for (const p of REND) {
    const t = fs.readFileSync(p, "utf8");
    re.lastIndex = 0;
    const c = (t.match(re) || []).length;
    if (!c) continue;
    // classify by the 6 chars following the match
    re.lastIndex = 0; let m; const kinds = new Map();
    while ((m = re.exec(t)) !== null) {
      const after = t.substr(m.index + 5, 6);
      const k = /^[A-Za-z]/.test(after) ? "runas" + after.match(/^[A-Za-z]+/)[0] : "(standalone)";
      kinds.set(k, (kinds.get(k) || 0) + 1);
    }
    bucket.set(path.relative(SRC, p).replace(/\\/g, "/"), { c, kinds });
  }
  const rows = [...bucket.entries()].sort((a, b) => b[1].c - a[1].c);
  console.log("  files containing 'runas': " + rows.length);
  for (const [f, v] of rows) {
    console.log("    " + f.padEnd(58) + " x" + String(v.c).padStart(3) +
      "   [" + [...v.kinds.entries()].map(([k, n]) => k + ":" + n).join(", ") + "]");
  }
}