"use strict";
// Claude Desktop IPC — LAYER 3: the MAIN side.
// Layer 2 found 1384 preload-referenced channels but only 7 main refs, because
// the main process never spells channel names out. It builds them at runtime via
// the codegen factory:
//
//   ao(PREFIX, "InterfaceName", senderGuard, { methods:[["methodName",[args],resultValidator], ...],
//                                              stores:[...], events:[...] })
//
// and inside `ao`:  s = e + t + "_$_"      // PREFIX + InterfaceName + "_$_"
//                   handle channel = s + methodName
//                   store  channel = s + storeName + Exe
//                   event  channel = s + eventName
//
// So the true handler set is derived from the ao() call sites, NOT from string grep.
// Rebuilt from scratch.

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

// per-file prefix literal table
const PREFIX_RE = /([A-Za-z_$][\w$]*)\s*=\s*"\$eipc_message\$_[0-9a-f-]{36}_\$_[^"]*_\$_"/g;

const handlers = new Map(); // channel -> {iface, guard, kind, file, at}

for (const f of files) {
  const rel = path.relative(SRC, f).replace(/\\/g, "/");
  const t = fs.readFileSync(f, "utf8");

  const prefixes = new Map();
  PREFIX_RE.lastIndex = 0;
  let m;
  while ((m = PREFIX_RE.exec(t)) !== null)
    prefixes.set(m[1], m[0].slice(m[0].indexOf('"') + 1, m[0].lastIndexOf('"')));

  // ao(PREFIXVAR, "Iface", GUARD, { ... })
  const AO_RE = /ao\(\s*([A-Za-z_$][\w$]*)\s*,\s*"([^"]+)"\s*,\s*([A-Za-z_$][\w$]*)\s*,\s*\{/g;
  let a;
  while ((a = AO_RE.exec(t)) !== null) {
    const prefix = prefixes.get(a[1]);
    const iface = a[2];
    const guard = a[3];
    if (!prefix) continue;
    const base = prefix + iface + "_$_";

    // find the balanced object literal starting at a[0].lastIndexOf("{")
    const objStart = t.lastIndexOf("{", a.index + a[0].length - 1);
    let depth = 0, i = objStart, end = -1;
    for (; i < t.length; i++) {
      const ch = t[i];
      if (ch === "{") depth++;
      else if (ch === "}") { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) continue;
    const obj = t.slice(objStart, end + 1);

    // methods:[ ["name", [args], ret], ... ]
    const methods = obj.match(/methods\s*:\s*\[/);
    if (methods) {
      const arrStart = obj.indexOf("[", obj.indexOf("methods"));
      let d = 0, e2 = -1;
      for (let j = arrStart; j < obj.length; j++) {
        if (obj[j] === "[") d++;
        else if (obj[j] === "]") { d--; if (d === 0) { e2 = j; break; } }
      }
      const arr = obj.slice(arrStart, e2 + 1);
      const NAME_RE = /\[\s*"([^"]+)"/g;
      let nm;
      while ((nm = NAME_RE.exec(arr)) !== null) {
        const ch2 = base + nm[1];
        if (!handlers.has(ch2)) handlers.set(ch2, { iface, guard, kind: "method", file: rel, at: a.index });
      }
    }
    // events:[ [name, ...], ... ]
    const ev = obj.match(/events\s*:\s*\[/);
    if (ev) {
      const arrStart = obj.indexOf("[", obj.indexOf("events"));
      let d = 0, e2 = -1;
      for (let j = arrStart; j < obj.length; j++) {
        if (obj[j] === "[") d++;
        else if (obj[j] === "]") { d--; if (d === 0) { e2 = j; break; } }
      }
      const arr = obj.slice(arrStart, e2 + 1);
      const NAME_RE = /\[\s*"([^"]+)"/g;
      let nm;
      while ((nm = NAME_RE.exec(arr)) !== null) {
        const ch2 = base + nm[1];
        if (!handlers.has(ch2)) handlers.set(ch2, { iface, guard, kind: "event", file: rel, at: a.index });
      }
    }
  }
}

// merge layer-2 preload channels
const pre = JSON.parse(fs.readFileSync(path.join(__dirname, "ipc-decoded2.json"), "utf8"));
const preMap = new Map(pre.channels.map((c) => [c.channel, c]));

const rows = [...handlers.entries()].map(([ch, v]) => ({
  channel: ch, iface: v.iface, guard: v.guard, kind: v.kind, file: v.file,
  inPreload: preMap.has(ch),
  preloadFiles: preMap.has(ch) ? [...new Set(preMap.get(ch).preload.map((x) => x.file))] : [],
  kinds: preMap.has(ch) ? preMap.get(ch).kinds : [],
})).sort((a, b) => a.channel.localeCompare(b.channel));

const unmatchedPreload = pre.channels.filter((c) => !handlers.has(c.channel));

// guard usage census
const guardCensus = new Map();
for (const r of rows) guardCensus.set(r.guard, (guardCensus.get(r.guard) || 0) + 1);

const out = [];
const P = (s = "") => out.push(s);
P(`=== LAYER-3: MAIN-SIDE HANDLERS (derived from ao() codegen call sites) ===`);
P(`method       : parse ao(PREFIX,"Iface",GUARD,{methods/events}) and expand base=PREFIX+Iface+"_$_"`);
P(`corpus       : ${files.length} .js files, raw text`);
P();
P(`derived handler channels : ${rows.length}`);
P(`matched in preload       : ${rows.filter(r=>r.inPreload).length}`);
P(`NOT referenced by preload: ${rows.filter(r=>!r.inPreload).length}`);
P(`preload channels with NO derived handler: ${unmatchedPreload.length}`);
P();
P(`=== SENDER-GUARD CENSUS (3rd arg of ao()) ===`);
for (const [g, n] of [...guardCensus].sort((a,b)=>b[1]-a[1])) P(`  ${g.padEnd(14)} ${n} interfaces`);
P();
P(`=== HANDLERS GROUPED BY INTERFACE ===`);
const byIface = new Map();
for (const r of rows) { if(!byIface.has(r.iface)) byIface.set(r.iface, []); byIface.get(r.iface).push(r); }
for (const [iface, list] of [...byIface].sort((a,b)=>b[1].length-a[1].length)) {
  P(`\n  ${iface}   guard=${list[0].guard}   methods=${list.length}`);
  P(`    ${list.map(r=>r.method || r.channel.split("_$_").pop()).join(", ")}`);
}

fs.writeFileSync(path.join(__dirname, "ipc-main.json"), JSON.stringify({
  method: "ao() codegen call-site expansion",
  counts: { derived: rows.length, matchedInPreload: rows.filter(r=>r.inPreload).length, preloadUnmatched: unmatchedPreload.length },
  handlers: rows,
}, null, 2));

console.log(out.join("\n"));
console.log("\nwrote ipc-main.json");
