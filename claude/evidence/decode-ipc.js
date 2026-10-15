"use strict";
// Claude Desktop IPC channel inventory — decoder rebuilt from scratch.
//
// Channel grammar (derived from the artifacts, not assumed):
//   $eipc_message$_<namespace-uuid>_$_<exposeInMainWorld name>_$_<Interface>_$_<method>
//
// Files under .vite/build whose basename has NO "chunk" are PRELOAD entry points
// (mainView.js, mainWindow.js, aboutWindow.js, quickWindow.js, findInPage.js,
//  buddy.js, coworkArtifact.js, designWindow.js, localExecConsent.js,
//  claudePagePreview.js, computerUseTeach.js, computerUseWatchRecord.js,
//  watchRecordChooser.js). Everything else is main-process / vendor.
//
// Method: raw-text regex over the .vite/build tree. Corpus is RAW TEXT, not an
// encoded string pool — no obfuscation key applies to this artifact.

const fs = require("fs");
const path = require("path");

const SRC = path.join(process.env.TEMP, "claude-src");
const BUILD = path.join(SRC, ".vite", "build");

function walk(dir) {
  const out = [];
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    if (fs.statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(js|mjs|cjs)$/i.test(n)) out.push(p);
  }
  return out;
}

const files = walk(BUILD);
const corpus = files.map((f) => ({
  rel: path.relative(SRC, f).replace(/\\/g, "/"),
  file: path.basename(f),
  text: fs.readFileSync(f, "utf8"),
}));

const totalBytes = corpus.reduce((a, c) => a + Buffer.byteLength(c.text), 0);
const totalChars = corpus.reduce((a, c) => a + c.text.length, 0);

const PRELOADS = new Set([
  "mainView.js", "mainWindow.js", "aboutWindow.js", "quickWindow.js",
  "findInPage.js", "buddy.js", "coworkArtifact.js", "designWindow.js",
  "localExecConsent.js", "claudePagePreview.js", "computerUseTeach.js",
  "computerUseWatchRecord.js", "watchRecordChooser.js",
]);
const isPreload = (c) => PRELOADS.has(c.file) && !c.file.startsWith("index.chunk-");

// ---- STEP 1: full literal channel strings ----
const CH_RE = /\$eipc_message\$_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_\$_[^"'\`\s]*?_\$_[^"'\`\s]*?_\$_[^"'\`;,)\]}]+/g;

const chan = new Map(); // channel -> {preload:{file,count}, main:{file,count}}
for (const c of corpus) {
  CH_RE.lastIndex = 0;
  let m;
  while ((m = CH_RE.exec(c.text)) !== null) {
    const name = m[0];
    if (!chan.has(name)) chan.set(name, { preload: new Map(), main: new Map() });
    const side = isPreload(c) ? "preload" : "main";
    const bag = chan.get(name)[side];
    bag.set(c.rel, (bag.get(c.rel) || 0) + 1);
  }
}

// ---- STEP 2: what does the preload actually DO with each channel? ----
// classify by the call that follows the channel literal in a preload file
function classifyCall(text, at) {
  const tail = text.slice(at, at + 220);
  if (/\.ipcRenderer\s*\.\s*invoke|\.invoke\(/.test(tail)) return "invoke";
  if (/\.ipcRenderer\s*\.\s*send|\.send\(/.test(tail)) return "send";
  if (/\.ipcRenderer\s*\.\s*on\b/.test(tail)) return "on";
  if (/\.ipcRenderer\s*\.\s*sendSync|\.sendSync\(/.test(tail)) return "sendSync";
  return "unknown";
}

const rows = [];
for (const [name, sides] of chan) {
  const pl = [...sides.preload.entries()];
  const mn = [...sides.main.entries()];
  let kinds = new Set();
  for (const c of corpus) {
    if (!isPreload(c)) continue;
    let i = -1;
    while ((i = c.text.indexOf(name, i + 1)) >= 0) kinds.add(classifyCall(c.text, i));
  }
  rows.push({ name, pl, mn, kinds: [...kinds] });
}

rows.sort((a, b) => a.name.localeCompare(b.name));

const out = [];
const P = (s = "") => out.push(s);

P(`=== CORPUS ===`);
P(`method            : raw-text regex over .vite/build tree`);
P(`corpus scope      : code (.js/.mjs/.cjs), extracted from app.asar; locales EXCLUDED`);
P(`obfuscation        : none observed — this artifact is minified, not string-encoded`);
P(`js/mjs files      : ${corpus.length}`);
P(`total bytes       : ${totalBytes}`);
P(`total chars       : ${totalChars}`);
P(`bytes == chars    : ${totalBytes === totalChars} (pure ASCII corpus)`);
P();
P(`=== CHANNEL GRAMMAR ===`);
P(`$eipc_message$_<namespace-uuid>_$_<exposeName>_$_<Interface>_$_<method>`);
P();
P(`distinct concrete channels: ${rows.length}`);
P();

const namespaces = new Map();
for (const r of rows) {
  const ns = r.name.split("_$_")[1];
  namespaces.set(ns, (namespaces.get(ns) || 0) + 1);
}
P(`=== NAMESPACES (uuid -> distinct channels) ===`);
for (const [ns, n] of [...namespaces].sort((a, b) => b[1] - a[1])) P(`  ${ns}  ${n}`);
P();

P(`=== CHANNEL INVENTORY ===`);
for (const r of rows) {
  const parts = r.name.split("_$_");
  P(`\n${r.name}`);
  P(`    expose=${parts[2]}  interface=${parts[3]}  method=${parts[4]}`);
  P(`    preload-refs: ${r.pl.length ? r.pl.map(([f, n]) => `${f}(${n})`).join(", ") : "NONE"}`);
  P(`    main-refs   : ${r.mn.length ? r.mn.map(([f, n]) => `${f}(${n})`).join(", ") : "NONE"}`);
  P(`    call kinds  : ${r.kinds.join(", ") || "NONE"}`);
}

fs.writeFileSync(
  path.join(__dirname, "ipc-decoded.json"),
  JSON.stringify(
    {
      corpus: { files: corpus.length, bytes: totalBytes, chars: totalChars, method: "raw-text regex", scope: "code only" },
      channelCount: rows.length,
      namespaces: [...namespaces],
      channels: rows.map((r) => ({
        channel: r.name,
        expose: r.name.split("_$_")[2],
        iface: r.name.split("_$_")[3],
        method: r.name.split("_$_")[4],
        preloadRefs: r.pl, mainRefs: r.mn, kinds: r.kinds,
      })),
    },
    null,
    2
  )
);

console.log(out.join("\n"));
console.log(`\n\nwrote ipc-decoded.json (${rows.length} channels)`);
