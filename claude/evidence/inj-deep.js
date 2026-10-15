"use strict";
// Deep read: what Claude actually does about prompt injection, and whether there
// is an execution sandbox or only an approval gate.
const fs = require("fs");
const SRC = process.env.TEMP + "\\claude-src";
const EQ = "=".repeat(80);

const files = [];
(function walk(d) {
  let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = d + "\\" + e.name;
    if (e.isDirectory()) walk(p);
    else if (/\.(js|mjs|cjs)$/i.test(e.name)) files.push(p);
  }
})(SRC);

const MAIN = SRC + "\\.vite\\build";
const mainFiles = files.filter(function (f) { return f.startsWith(MAIN); });

function allHits(list, re, win, cap) {
  const out = [];
  for (const f of list) {
    let t; try { t = fs.readFileSync(f, "utf8"); } catch { continue; }
    re.lastIndex = 0;
    let m, i = 0;
    while ((m = re.exec(t)) !== null && i < cap) {
      const s = Math.max(0, m.index - win);
      out.push([f.slice(SRC.length + 1).replace(/\\/g, "/"), m.index, t.slice(s, m.index + win)]);
      i++;
      if (re.lastIndex === 0) break;
    }
  }
  return out;
}

function dump(title, list, re, win, cap) {
  const h = allHits(list, re, win, cap);
  console.log("");
  console.log(EQ);
  console.log("== " + title + "   hits=" + h.length);
  console.log(EQ);
  for (const e of h) console.log("\n  [" + e[0] + " @" + e[1] + "]\n  " + e[2].replace(/\s+/g, " "));
}

// 1. THE DECISIVE ONE — explicit prompt-injection handling
dump("prompt injection (11)", mainFiles, /prompt[\s_-]?injection/gi, 320, 12);

// 2. bare injection
dump("injection (bare)", mainFiles, /\binjection\b/gi, 240, 18);

// 3. untrusted
dump("untrusted", mainFiles, /\buntrusted\b/gi, 240, 45);

// 4. THE SANDBOX — vhdx references
dump(".vhdx (VM image)", mainFiles, /\.vhdx/gi, 300, 25);

// 5. Hyper-V
dump("Hyper-V", mainFiles, /hyper-?v\b|\bvmcompute\b|\bvmms\b/gi, 300, 5);

// 6. cowork-svc — report 03 claims this is the escalation path
dump("cowork-svc / coworkSvc / svc.exe", files, /cowork[\s_-]?svc|coworkSvc|svc\.exe/gi, 260, 10);

// 7. permission modes
dump("permissionMode enum values", mainFiles, /permissionMode\s*[:=]\s*[`"'][a-z-]+[`"']/gi, 200, 20);

// 8. bypassPermissions
dump("bypassPermissions", mainFiles, /bypassPermissions/gi, 240, 14);

console.log("");
console.log("DONE");