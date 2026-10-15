"use strict";
// SETTLE THE COUNT. The earlier regex /\[\s*"([^"]+)"/g matched tuples at ANY
// nesting depth, so a method tuple like
//     ["getConnectedFiles", [["sessionId", P]], R]
// counted both "getConnectedFiles" AND the nested "sessionId" -> over-count.
// This pass walks the array at depth 1 only.
const fs = require("fs");
const path = require("path");
const SRC = path.join(process.env.TEMP, "claude-src");
function walk(d){const o=[];for(const n of fs.readdirSync(d)){const p=path.join(d,n);
  if(fs.statSync(p).isDirectory())o.push(...walk(p));else if(/\.(js|mjs)$/i.test(n))o.push(p);}return o;}

function topLevelTuples(arr) {
  // arr is the text of the outer [ ... ]
  const out = [];
  let d = 0, start = -1, inStr = false, q = "";
  for (let i = 0; i < arr.length; i++) {
    const c = arr[i];
    if (inStr) { if (c === "\\") { i++; continue; } if (c === q) inStr = false; continue; }
    if (c === '"' || c === "'" || c === "`") { inStr = true; q = c; continue; }
    if (c === "[") {
      d++;
      if (d === 2) start = i;      // a direct child tuple
    } else if (c === "]") {
      if (d === 2 && start >= 0) {
        const inner = arr.slice(start, i + 1);
        const m = /^\s*\[\s*"([^"]+)"/.exec(inner);
        if (m) out.push(m[1]);
      }
      d--;
      if (d === 0) break;
    }
  }
  return out;
}

const files = walk(SRC);
const chans = new Map();
let siteCount = 0, tupleCount = 0;

for (const f of files) {
  const rel = path.relative(SRC, f).replace(/\\/g, "/");
  const t = fs.readFileSync(f, "utf8");
  const prefixes = new Map();
  const pre = /([A-Za-z_$][\w$]*)\s*=\s*("\$eipc_message\$_[0-9a-f-]{36}_\$_[^"]*_\$_")/g;
  let pm; while ((pm = pre.exec(t)) !== null) prefixes.set(pm[1], pm[2].slice(1, -1));

  const ao = /\bao\(\s*([A-Za-z_$][\w$]*)\s*,\s*"([^"]+)"\s*,\s*([A-Za-z_$][\w$]*)\s*,\s*\{/g;
  let m;
  while ((m = ao.exec(t)) !== null) {
    const prefix = prefixes.get(m[1]);
    if (!prefix) continue;
    siteCount++;
    const base = prefix + m[2] + "_$_", guard = m[3];
    const objStart = t.lastIndexOf("{", m.index + m[0].length - 1);
    let d = 0, end = -1;
    for (let i = objStart; i < t.length; i++) {
      if (t[i] === "{") d++; else if (t[i] === "}") { d--; if (d === 0) { end = i; break; } }
    }
    if (end < 0) continue;
    const obj = t.slice(objStart, end + 1);
    for (const key of ["methods", "events"]) {
      const ki = obj.indexOf(key + ":[");
      if (ki < 0) continue;
      const arrStart = obj.indexOf("[", ki);
      let dd = 0, e2 = -1;
      for (let j = arrStart; j < obj.length; j++) {
        if (obj[j] === "[") dd++; else if (obj[j] === "]") { dd--; if (dd === 0) { e2 = j; break; } }
      }
      for (const name of topLevelTuples(obj.slice(arrStart, e2 + 1))) {
        tupleCount++;
        const ch = base + name;
        if (!chans.has(ch)) chans.set(ch, { iface: m[2], guard, kind: key, file: rel });
      }
    }
  }
}

const guards = new Map();
for (const v of chans.values()) guards.set(v.guard, (guards.get(v.guard) || 0) + 1);

console.log("=== DEPTH-AWARE RECOUNT (top-level tuples only) ===");
console.log(`ao() call sites            : ${siteCount}`);
console.log(`top-level method/event tuples: ${tupleCount}`);
console.log(`UNIQUE derived channels    : ${chans.size}`);
console.log(`\nguard -> unique channels:`);
for (const [g, n] of [...guards].sort((a,b)=>b[1]-a[1])) console.log(`  ${g.padEnd(10)} ${n}`);

const topOnly = ["Ixe","PMr","vTi","nba"];
let to = 0; for (const [,v] of chans) if (topOnly.includes(v.guard)) to++;
const toIface = new Set(); for (const [,v] of chans) if (topOnly.includes(v.guard)) toIface.add(v.iface);
console.log(`\ntop-frame-only channels    : ${to}  (${(100*to/chans.size).toFixed(1)}% of surface)`);
console.log(`interfaces: ${[...toIface].sort().join(", ")}`);

// Yjr / electron_window namespace
let yjr = 0;
for (const [,v] of chans) if (v.guard === "Yjr") yjr++;
console.log(`\nchannels guarded by Yjr (the fail-open guard): ${yjr}`);

fs.writeFileSync(path.join(__dirname,"recount-depth.json"), JSON.stringify({
  sites: siteCount, tuples: tupleCount, unique: chans.size,
  guards: [...guards].map(([g,n])=>({guard:g,n})),
  topFrameOnly: to, yjrChannels: yjr,
}, null, 2));
console.log("\nwrote recount-depth.json");
