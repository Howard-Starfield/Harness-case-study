"use strict";
// Round 5 - fix two method bugs from round 4:
//   (a) IPC shapes were counted per-FILE, not per-MATCH -> all rows read "34"
//   (b) .node search found 0 while the asar index lists 6 -> resolve the conflict
const fs = require("fs");
const path = require("path");
const SRC = path.join(process.env.TEMP, "codex-src");
const B = path.join(SRC, ".vite", "build");
const HERE = __dirname;

const EQ = "=".repeat(74);
const DASH = "-".repeat(74);
function hdr(title) { console.log("\n" + EQ + "\n== " + title + "\n" + EQ); }

const files = fs.readdirSync(B).filter((f) => /\.(js|mjs)$/i.test(f));
const ALL = files.map((f) => ({ name: f, text: fs.readFileSync(path.join(B, f), "utf8") }));

// ---------- (a) corrected IPC registration census ----------
hdr("IPC REGISTRATION CENSUS (corrected: occurrences, not files)");
const SHAPES = {
  "ipcMain.handle": /ipcMain\.handle\(/g,
  "ipcMain.on": /ipcMain\.on\(/g,
  "ipcMain.handleOnce": /ipcMain\.handleOnce\(/g,
  "ipcMain.removeHandler": /ipcMain\.removeHandler\(/g,
  "ipcMain.removeAllListeners": /ipcMain\.removeAllListeners\(/g,
  "ipcRenderer.send": /ipcRenderer\.send\(/g,
  "ipcRenderer.invoke": /ipcRenderer\.invoke\(/g,
  "ipcRenderer.sendSync": /ipcRenderer\.sendSync\(/g,
  "ipcRenderer.postMessage": /ipcRenderer\.postMessage\(/g,
  "webContents.send": /webContents\.send\(/g,
  "webContents.sendSync": /webContents\.sendSync\(/g,
};
for (const label of Object.keys(SHAPES)) {
  const re = SHAPES[label];
  let n = 0; const hit = [];
  for (const it of ALL) {
    re.lastIndex = 0;
    const c = (it.text.match(re) || []).length;
    if (c) { n += c; hit.push(it.name); }
  }
  console.log("  " + label.padEnd(28) + String(n).padStart(5) + "   files: " + (hit.join(", ") || "-"));
}

// ---------- resolve the minified channel-name constants ----------
hdr("IPC CHANNEL NAMES (string literals passed to ipcMain)");
const chan = new Map();
for (const it of ALL) {
  const re = /ipcMain\.(?:handle|on|handleOnce)\(\s*[`'"]([^`'"]+)[`'"]/g;
  let m;
  while ((m = re.exec(it.text)) !== null) {
    if (!chan.has(m[1])) chan.set(m[1], new Set());
    chan.get(m[1]).add(it.name);
  }
}
console.log("distinct literal channels: " + chan.size);
for (const k of Array.from(chan.keys()).sort()) {
  console.log("  " + k.padEnd(46) + Array.from(chan.get(k)).join(",").slice(0, 40));
}

console.log("\n" + DASH + "\n-- minified channel constants (X.y passed to ipcMain) --");
for (const it of ALL) {
  const re = /ipcMain\.(?:handle|on|handleOnce)\(\s*([A-Za-z_$][\w$]*)\.([\w$]+)/g;
  let m; const s = new Set();
  while ((m = re.exec(it.text)) !== null) s.add(m[1] + "." + m[2]);
  if (s.size) console.log("  " + it.name + ": " + Array.from(s).join(", "));
}

// ---------- (b) resolve the .node discrepancy ----------
hdr(".node FILE RECONCILIATION");
const idxPath = path.join(HERE, "asar-index.json");
if (fs.existsSync(idxPath)) {
  const idx = JSON.parse(fs.readFileSync(idxPath, "utf8"));
  const entries = idx.entries || idx;
  const list = Array.isArray(entries) ? entries : Object.values(entries).flat();
  const nodes = list.filter((e) => String(e.path || e.name || "").toLowerCase().endsWith(".node"));
  console.log("asar index .node entries: " + nodes.length);
  nodes.forEach((e) => console.log("  " + (e.path || e.name) + "  size=" + e.size));
} else console.log("  (no asar-index.json)");

let found = 0;
(function walk(d) {
  let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.toLowerCase().endsWith(".node")) {
      found++;
      console.log("  EXTRACTED: " + path.relative(SRC, p).replace(/\\/g, "/") + "  " + fs.statSync(p).size + " B");
    }
  }
})(SRC);
console.log("extracted tree .node files: " + found);