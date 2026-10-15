"use strict";
// Codex round 4: IPC allowlist vs passthrough, sender validation, preload bridge,
// native .node inventory, and the approval/exec gate.
const fs = require("fs");
const path = require("path");
const SRC = path.join(process.env.TEMP, "codex-src");
const B = path.join(SRC, ".vite", "build");

const files = fs.readdirSync(B).filter((f) => /\.(js|mjs)$/i.test(f));
const ALL = files.map((f) => ({ name: f, text: fs.readFileSync(path.join(B, f), "utf8") }));
const ctx = (t, i, w = 320) => t.slice(Math.max(0, i - w), Math.min(t.length, i + w)).replace(/\s+/g, " ");

function find(re, label, limit = 5, w = 400) {
  console.log(`\n${"-".repeat(74)}\n-- ${label}`);
  let n = 0;
  for (const { name, text } of ALL) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      n++; if (n > limit) break;
      console.log(`\n  [${name} @${m.index}] ${m[0].slice(0,90)}`);
      console.log("    " + ctx(text, m.index, w));
    }
  }
  console.log(n === 0 ? "  (no hits)" : `  (${n} shown)`);
}

console.log("=".repeat(74));
console.log("== IPC REGISTRATION SHAPES (allowlist vs raw passthrough)");
console.log("=".repeat(74));
const shapes = new Map();
for (const { name, text } of ALL) {
  for (const re of [/ipcMain\.handle\(/g, /ipcMain\.on\(/g, /ipcMain\.handleOnce\(/g,
                    /ipcMain\.removeHandler\(/g, /\.sendSync\(/g, /\.invoke\(/g]) {
    const k = re.source.replace(/\\/g, "").replace(/\(.*/, "");
    shapes.set(k, (shapes.get(k) || 0) + 1);
  }
}
for (const [k, v] of [...shapes.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(26)} ${v}`);

console.log(`\n${"=".repeat(74)}\n== SENDER VALIDATION needles`);
console.log("=".repeat(74));
for (const re of [/senderFrame/g, /sender\.frame/g, /event\.sender\b/g, /\.getURL\(\)/g,
                  /frame\.url/g, /isMainFrame/g, /topFrame/g, /webContents\.id===/g]) {
  let n = 0;
  for (const { text } of ALL) { re.lastIndex = 0; n += (text.match(re) || []).length; }
  console.log(`  ${re.source.padEnd(28)} ${n}`);
}

find(/ipcMain\.handle\(/g, "ipcMain.handle() sites", 4, 500);
find(/exposeInMainWorld/g, "contextBridge.exposeInMainWorld sites", 4, 500);
find(/senderFrame/g, "senderFrame usage", 4, 450);

console.log(`\n${"=".repeat(74)}\n== NATIVE .node MODULES IN ASAR`);
console.log("=".repeat(74));
(function walk(d, out = []) {
  let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, out); else out.push(p); }
  return out;
})(SRC).filter((p) => p.endsWith(".node")).sort().forEach((p) => {
  const st = fs.statSync(p);
  const fd = fs.openSync(p, "r"); const b = Buffer.alloc(2); fs.readSync(fd, b, 0, 2, 0); fs.closeSync(fd);
  console.log(`  ${path.relative(SRC, p).replace(/\\/g, "/").padEnd(62)} ${st.size.toLocaleString().padStart(10)} B  ${b.toString("hex") === "4d5a" ? "PE" : "?"}`);
});

console.log(`\n${"=".repeat(74)}\n== APPROVAL / EXEC-POLICY needles`);
console.log("=".repeat(74));
for (const re of [/exec-?policy/gi, /approvalPolicy/gi, /askForApproval/gi, /sandboxMode/gi,
                  /requestApproval/gi, /untrusted/gi, /autoApprov/gi, /workspace-?write/gi,
                  /danger-full-access/gi, /read-only/gi]) {
  let n = 0;
  for (const { text } of ALL) { re.lastIndex = 0; n += (text.match(re) || []).length; }
  console.log(`  ${re.source.padEnd(28)} ${n}`);
}
find(/danger-full-access/gi, "danger-full-access", 3, 350);
find(/approvalPolicy/gi, "approvalPolicy", 3, 350);