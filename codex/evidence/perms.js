"use strict";
// Codex: how are auto / manual / full-access modes actually controlled, and what
// stops the model writing outside the folders the user granted?
// Extract the enums, the policy objects, the roots binding, and the auto-approval rules.
const fs = require("fs");
const path = require("path");
const SRC = path.join(process.env.TEMP, "codex-src");
const B = path.join(SRC, ".vite", "build");
const EQ = "=".repeat(76);
function hdr(t) { console.log("\n" + EQ + "\n== " + t + "\n" + EQ); }

const files = fs.readdirSync(B).filter((f) => /\.(js|mjs)$/i.test(f));
const ALL = files.map((f) => ({ name: f, text: fs.readFileSync(path.join(B, f), "utf8") }));
const isMain = (n) => n.startsWith(".vite") || true; // all scanned are MAIN
const ctx = (t, i, w) => t.slice(Math.max(0, i - w / 2), Math.min(t.length, i + w / 2)).replace(/\s+/g, " ");

function show(re, label, limit, w, where) {
  const pool = where === "RENDER"
    ? [] : ALL;
  console.log("\n" + "-".repeat(76) + "\n-- " + label);
  let n = 0;
  for (const it of pool) {
    re.lastIndex = 0; let m;
    while ((m = re.exec(it.text)) !== null) {
      n++; if (n > limit) break;
      console.log("\n  [" + it.name + " @" + m.index + "] " + m[0].slice(0, 100));
      console.log("    " + ctx(it.text, m.index, w || 520));
    }
  }
  if (!n) console.log("  (no hits)");
  return n;
}

// ---------- 1. approval mode enum ----------
hdr("1. approvalPolicy enum - every distinct value used in MAIN");
{
  const vals = new Map();
  for (const it of ALL) {
    for (const re of [/approvalPolicy\s*[:=]\s*`([^`]+)`/g, /approvalPolicy\s*[:=]\s*`([^`]+)`/g]) {
      re.lastIndex = 0; let m;
      while ((m = re.exec(it.text)) !== null) vals.set(m[1], (vals.get(m[1]) || 0) + 1);
    }
  }
  console.log("  values assigned to approvalPolicy: " + JSON.stringify([...vals.entries()]));
  // broader: any backticked token near 'approval'
  const near = new Set();
  for (const it of ALL) {
    const re = /`([a-z]+(?:-[a-z]+){0,3})`/g; let m;
    while ((m = re.exec(it.text)) !== null) {
      const s = Math.max(0, m.index - 120), e = Math.min(it.text.length, m.index + 120);
      const win = it.text.slice(s, e);
      if (/approvalPolicy|approvalsReviewer|requestApproval/i.test(win)) near.add(m[1]);
    }
  }
  const interesting = [...near].filter((v) => /untrust|fail|request|never|auto|review|allow|deny|full|danger|read|write|workspace|sandbox|command|escalat/i.test(v));
  console.log("  backticked tokens appearing within 120 chars of an 'approval' keyword:");
  console.log("    " + interesting.sort().join(", "));
}

// ---------- 2. sandbox policy shape ----------
hdr("2. sandboxPolicy shape + writable roots");
show(/sandboxPolicy\s*[:=]\s*\{/g, "sandboxPolicy object literals", 4, 900);
show(/writable_?[Rr]oots?/g, "writableRoots / writable_roots", 6, 700);
show(/workspace-?write/gi, "workspace-write", 5, 700);
show(/danger-?full-?access/gi, "danger-full-access", 5, 700);
show(/read-?only/gi, "read-only", 3, 500);

// ---------- 3. root binding / containment ----------
hdr("3. workspace root binding + path containment");
for (const [label, re] of [
  ["workspaceRoot", /workspaceRoot/g],
  ["cwd assignment", /\bcwd\s*[:=]/g],
  ["path.isAbsolute / resolve", /path\.isAbsolute|\.resolve\(/g],
  ["relative-to check", /startsWith\(/g],
  ["symlink / realpath", /realpath|symlink|lstat|readlink/i],
]) {
  let n = 0; const files2 = new Set();
  for (const it of ALL) { re.lastIndex = 0; n += (it.text.match(re) || []).length; if (re.test(it.text)) files2.add(it.name); }
  console.log("  " + label.padEnd(28) + String(n).padStart(6) + "   files=" + files2.size);
}
show(/workspaceRoot/g, "workspaceRoot usages", 4, 700);

// ---------- 4. auto-approval ----------
hdr("4. auto-approval rule engine");
show(/autoApprov\w*/gi, "autoApproval tokens", 6, 800);
show(/autoApprovalReview\/\w+/g, "autoApprovalReview notifications", 5, 600);
show(/strictReviewRequired/g, "strictReviewRequired", 4, 700);

// ---------- 5. the requestApproval family ----------
hdr("5. requestApproval family (the actual gate)");
show(/item\/\w+\/requestApproval/g, "inbound approval notifications", 8, 320);
show(/exec-?policy/gi, "exec-policy", 5, 700);
show(/sandboxMode/gi, "sandboxMode", 4, 600);