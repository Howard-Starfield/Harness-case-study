"use strict";
// Claude Desktop IPC — LAYER 2 decoder.
// Layer 1 (decode-ipc.js) recovered only fully-literal channels (10).
// The bulk are built by concatenating a namespace-prefix VARIABLE with a
// method literal, e.g.  k+"WindowControl_$_resize".
//
// This pass resolves the prefix variables to their literal values and
// expands every concatenation into a concrete channel name.
// Rebuilt from scratch; no prior index consulted.

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

const PREFIX_RE = /(?:\b(?:var|let|const)\s+|\b)([A-Za-z_$][\w$]*)\s*=\s*"\$eipc_message\$_[0-9a-f-]{36}_\$_[^"]*_\$_"/g;

// Build prefixVar -> literal, PER FILE (obfuscation/aliasing is per-file; never carry across).
const perFile = corpus.map((c) => {
  const prefixes = new Map();
  PREFIX_RE.lastIndex = 0;
  let m;
  while ((m = PREFIX_RE.exec(c.text)) !== null) prefixes.set(m[1], m[0].slice(m[0].indexOf('"') + 1, m[0].lastIndexOf('"')));
  return { ...c, prefixes };
});

// Expand  varName + "Rest_$_method"  -> concrete channel
const CONCAT_RE = /([A-Za-z_$][\w$]*)\s*\+\s*"([^"]*)"/g;

const chan = new Map(); // concrete channel -> {preload:[], main:[], kinds:Set}
for (const c of perFile) {
  CONCAT_RE.lastIndex = 0;
  let m;
  while ((m = CONCAT_RE.exec(c.text)) !== null) {
    const prefix = c.prefixes.get(m[1]);
    if (!prefix) continue;
    const rest = m[2];
    if (!rest.includes("_$_")) continue;
    const full = prefix + rest;
    if (!chan.has(full)) chan.set(full, { preload: [], main: [], kinds: new Set() });
    const e = chan.get(full);
    const isPre = !c.file.startsWith("index.chunk-") && !c.file.startsWith("index.");
    (isPre ? e.preload : e.main).push({ file: c.rel, at: m.index });
    const tail = c.text.slice(m.index, m.index + 200);
    if (/\.ipcRenderer\s*\.\s*invoke|\.invoke\(/.test(tail)) e.kinds.add("invoke");
    else if (/\.ipcRenderer\s*\.\s*send\b|\.send\(/.test(tail)) e.kinds.add("send");
    else if (/\.ipcRenderer\s*\.\s*sendSync/.test(tail)) e.kinds.add("sendSync");
    else if (/\.ipcRenderer\s*\.\s*on\b/.test(tail)) e.kinds.add("on");
  }
}

// merge in the literal channels from layer 1
const CH_RE = /\$eipc_message\$_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_\$_[^"'\`\s]*?_\$_[^"'\`\s]*?_\$_[^"'\`;,)\]}]+/g;
for (const c of corpus) {
  CH_RE.lastIndex = 0;
  let m;
  while ((m = CH_RE.exec(c.text)) !== null) {
    const full = m[0];
    if (!chan.has(full)) chan.set(full, { preload: [], main: [], kinds: new Set() });
    const e = chan.get(full);
    const isPre = !c.file.startsWith("index.chunk-") && !c.file.startsWith("index.");
    const list = isPre ? e.preload : e.main;
    if (!list.some((x) => x.file === c.rel)) list.push({ file: c.rel, at: m.index });
    const tail = c.text.slice(m.index, m.index + 200);
    if (/\.ipcRenderer\s*\.\s*invoke|\.invoke\(/.test(tail)) e.kinds.add("invoke");
    else if (/\.ipcRenderer\s*\.\s*on\b/.test(tail)) e.kinds.add("on");
  }
}

const rows = [...chan.entries()]
  .map(([name, v]) => ({ name, pre: v.preload, mn: v.main, kinds: [...v.kinds] }))
  .sort((a, b) => a.name.localeCompare(b.name));

// --- set difference BOTH ways ---
const preOnly = rows.filter((r) => r.pre.length && !r.mn.length);
const mainOnly = rows.filter((r) => !r.pre.length && r.mn.length);
const both = rows.filter((r) => r.pre.length && r.mn.length);

const out = [];
const P = (s = "") => out.push(s);

P(`=== LAYER-2 IPC DECODER ===`);
P(`method       : per-file prefix-variable resolution + concatenation expansion`);
P(`corpus       : ${corpus.length} .js/.mjs files, raw text, ${corpus.reduce((a,c)=>a+c.text.length,0)} chars`);
P(`per-file scoping: prefix vars resolved ONLY within their own file (G10)`);
P();
P(`total distinct channels : ${rows.length}`);
P(`  referenced by preload : ${rows.filter(r=>r.pre.length).length}`);
P(`  referenced by main    : ${rows.filter(r=>r.mn.length).length}`);
P(`  in BOTH (matched)     : ${both.length}`);
P(`  PRELOAD-ONLY          : ${preOnly.length}`);
P(`  MAIN-ONLY             : ${mainOnly.length}`);
P();
P(`=== SET DIFFERENCE: preload-only (no main handler found) ===`);
for (const r of preOnly) P(`  ${r.name}\n      preload: ${[...new Set(r.pre.map(x=>x.file))].join(", ")}  kinds=${r.kinds.join("|")}`);
P();
P(`=== SET DIFFERENCE: main-only (handler with no preload caller) ===`);
for (const r of mainOnly) P(`  ${r.name}\n      main: ${[...new Set(r.mn.map(x=>x.file))].join(", ")}`);

fs.writeFileSync(path.join(__dirname, "ipc-decoded2.json"), JSON.stringify({
  method: "per-file prefix resolution + concat expansion",
  counts: { total: rows.length, preload: rows.filter(r=>r.pre.length).length, main: rows.filter(r=>r.mn.length).length, both: both.length, preloadOnly: preOnly.length, mainOnly: mainOnly.length },
  channels: rows.map(r=>({ channel:r.name, preload:r.pre, main:r.mn, kinds:r.kinds })),
}, null, 2));

console.log(out.join("\n"));
console.log(`\nwrote ipc-decoded2.json`);
