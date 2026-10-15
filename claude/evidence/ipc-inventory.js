"use strict";
// IPC surface inventory for an extracted Electron asar tree.
// Counts OCCURRENCES, not lines (bundles are single-line minified).
const fs = require("fs");
const path = require("path");

const root = process.argv[2];
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|mjs)$/.test(e.name)) files.push(p);
  }
})(root);

const rel = (p) => path.relative(root, p).replace(/\\/g, "/");

const counts = {
  filesScanned: 0,
  bytesScanned: 0,
  exposeInMainWorld: 0,
  ipcMainHandle: 0,
  ipcMainOn: 0,
  ipcMainHandleOnce: 0,
  ipcMainRemoveHandler: 0,
  ipcRendererInvoke: 0,
  ipcRendererSend: 0,
  ipcRendererOn: 0,
  webPreferences: 0,
  nodeIntegration: 0,
  contextIsolation: 0,
  webSecurity: 0,
  sandboxFalse: 0,
  willNavigate: 0,
  setWindowOpenHandler: 0,
  executeJavaScript: 0,
  openExternal: 0,
};

// preloads: files that call contextBridge.exposeInMainWorld
const preloads = [];
const exposedChannels = new Map(); // preload -> Set(channelName)
const mainHandlers = new Map();   // channel -> count
const rendererInvokers = new Map();
const rendererSenders = new Map();
const webPrefFiles = new Map();

// Codegen channel literal: "$eipc_message$_<uuid>_$_<Channel>_$_<Type>_$_<method>"
// Split on the _$_ separator rather than pattern-matching the whole shape.
const LIT_RE = /["'`](\$eipc_message\$_[^"'`]+)["'`]/g;
function channelsIn(src) {
  const out = new Set();
  let m;
  LIT_RE.lastIndex = 0;
  while ((m = LIT_RE.exec(src)) !== null) {
    const parts = m[1].split("_$_");
    out.add(parts.length >= 2 ? parts[1] : m[1]);
  }
  return out;
}

function addTo(map, key) {
  if (key === undefined || key === null) return;
  map.set(key, (map.get(key) || 0) + 1);
}

for (const f of files) {
  const buf = fs.readFileSync(f);
  const s = buf.toString("utf8");
  counts.filesScanned++;
  counts.bytesScanned += buf.length;

  const exCount = (s.match(/contextBridge\s*\.\s*exposeInMainWorld/g) || []).length;
  if (exCount > 0) preloads.push({ file: rel(f), exCount, size: buf.length });

  counts.exposeInMainWorld += exCount;
  counts.ipcMainHandle += (s.match(/ipcMain\s*\.\s*handle\s*\(/g) || []).length;
  counts.ipcMainHandleOnce += (s.match(/ipcMain\s*\.\s*handleOnce\s*\(/g) || []).length;
  counts.ipcMainOn += (s.match(/ipcMain\s*\.\s*on\s*\(/g) || []).length;
  counts.ipcMainRemoveHandler += (s.match(/ipcMain\s*\.\s*removeHandler\s*\(/g) || []).length;
  counts.ipcRendererInvoke += (s.match(/ipcRenderer\s*\.\s*invoke\s*\(/g) || []).length;
  counts.ipcRendererSend += (s.match(/ipcRenderer\s*\.\s*send\s*\(/g) || []).length;
  counts.ipcRendererOn += (s.match(/ipcRenderer\s*\.\s*on\s*\(/g) || []).length;

  const wp = (s.match(/webPreferences/g) || []).length;
  if (wp) webPrefFiles.set(rel(f), wp);
  counts.webPreferences += wp;
  counts.nodeIntegration += (s.match(/nodeIntegration/g) || []).length;
  counts.contextIsolation += (s.match(/contextIsolation/g) || []).length;
  counts.webSecurity += (s.match(/webSecurity/g) || []).length;
  counts.sandboxFalse += (s.match(/sandbox\s*:\s*(?:!1|false)/g) || []).length;
  counts.willNavigate += (s.match(/will-navigate/g) || []).length;
  counts.setWindowOpenHandler += (s.match(/setWindowOpenHandler/g) || []).length;
  counts.executeJavaScript += (s.match(/executeJavaScript/g) || []).length;
  counts.openExternal += (s.match(/openExternal/g) || []).length;

  // channels
  const chans = channelsIn(s);
  if (exCount > 0) exposedChannels.set(rel(f), chans);

  // ipcMain.handle("channel" style + codegen registration
  let m;
  const hm = /ipcMain\s*\.\s*handle\s*\(\s*["'`]([^"'`]+)["'`]/g;
  while ((m = hm.exec(s)) !== null) addTo(mainHandlers, m[1]);
  const om = /ipcMain\s*\.\s*on\s*\(\s*["'`]([^"'`]+)["'`]/g;
  while ((m = om.exec(s)) !== null) addTo(mainHandlers, m[1]);

  const im = /ipcRenderer\s*\.\s*invoke\s*\(\s*["'`]([^"'`]+)["'`]/g;
  while ((m = im.exec(s)) !== null) addTo(rendererInvokers, m[1]);
  const sm = /ipcRenderer\s*\.\s*send\s*\(\s*["'`]([^"'`]+)["'`]/g;
  while ((m = sm.exec(s)) !== null) addTo(rendererSenders, m[1]);
}

console.log("=== CORPUS ===");
console.log(JSON.stringify(counts, null, 2));

console.log("\n=== FILES CALLING contextBridge.exposeInMainWorld (candidate preloads) ===");
preloads.sort((a, b) => b.size - a.size).forEach((p) =>
  console.log(`${String(p.exCount).padStart(4)}  ${String(p.size).padStart(9)}  ${p.file}`));

const allExposed = new Set();
for (const set of exposedChannels.values()) for (const c of set) allExposed.add(c);
console.log(`\n=== DISTINCT CODEXPOSED CHANNELS (${allExposed.size}) ===`);
[...allExposed].sort().forEach((c) => console.log("  " + c));

console.log(`\n=== webPreferences BY FILE ===`);
[...webPrefFiles.entries()].sort((a, b) => b[1] - a[1]).forEach(([f, n]) =>
  console.log(`${String(n).padStart(5)}  ${f}`));

console.log(`\n=== ipcMain.handle/on WITH LITERAL CHANNEL (${mainHandlers.size}) ===`);
[...mainHandlers.entries()].sort().forEach(([c, n]) => console.log(`${String(n).padStart(4)}  ${c}`));

console.log(`\n=== renderer invoke literal channels (${rendererInvokers.size}) ===`);
[...rendererInvokers.entries()].sort().forEach(([c, n]) => console.log(`${String(n).padStart(4)}  ${c}`));

// set difference
const litHandlers = new Set(mainHandlers.keys());
const litCallers = new Set([...rendererInvokers.keys(), ...rendererSenders.keys()]);
const calledNoHandler = [...litCallers].filter((c) => !litHandlers.has(c) && !allExposed.has(c));
const handlerNoCaller = [...litHandlers].filter((c) => !litCallers.has(c));
console.log(`\n=== SET DIFFERENCE ===`);
console.log(`literal channels called by renderer but not matched by a literal handler: ${calledNoHandler.length}`);
calledNoHandler.forEach((c) => console.log("  " + c));
console.log(`literal handlers with no literal caller: ${handlerNoCaller.length}`);
handlerNoCaller.forEach((c) => console.log("  " + c));