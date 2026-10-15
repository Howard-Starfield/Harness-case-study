"use strict";
// INDEPENDENT RECOUNT of ao() call sites and method tuples.
// My first decoder used a regex that could match inside strings/comments and
// counted [ "name", [] ] entries loosely. Recount with balanced-paren parsing
// and a strict "first element is a string literal" rule.
const fs = require("fs");
const path = require("path");
const SRC = path.join(process.env.TEMP, "claude-src");
function walk(d){const o=[];for(const n of fs.readdirSync(d)){const p=path.join(d,n);
  if(fs.statSync(p).isDirectory())o.push(...walk(p));else if(/\.(js|mjs)$/i.test(n))o.push(p);}return o;}
const files = walk(SRC);

const sites = new Map();  // channel -> {iface, guard}
let siteCount = 0, tupleCount = 0;

for (const f of files) {
  const rel = path.relative(SRC, f).replace(/\\/g, "/");
  const t = fs.readFileSync(f, "utf8");

  // prefix literal table (per file)
  const prefixes = new Map();
  const pre = /([A-Za-z_$][\w$]*)\s*=\s*("\$eipc_message\$_[0-9a-f-]{36}_\$_[^"]*_\$_")/g;
  let pm; while ((pm = pre.exec(t)) !== null) prefixes.set(pm[1], pm[2].slice(1, -1));

  // ao( PREFIXVAR , "Iface" , GUARD , {
  const ao = /\bao\(\s*([A-Za-z_$][\w$]*)\s*,\s*"([^"]+)"\s*,\s*([A-Za-z_$][\w$]*)\s*,\s*\{/g;
  let m;
  while ((m = ao.exec(t)) !== null) {
    const prefix = prefixes.get(m[1]);
    if (!prefix) continue;
    siteCount++;
    const base = prefix + m[2] + "_$_";
    const guard = m[3];

    // balanced object
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
        if (obj[j] === "[") dd++;
        else if (obj[j] === "]") { dd--; if (dd === 0) { e2 = j; break; } }
      }
      const arr = obj.slice(arrStart, e2 + 1);
      // strict: a tuple starts with ["Name"
      const re = /\[\s*"([^"]+)"/g;
      let tm;
      while ((tm = re.exec(arr)) !== null) {
        tupleCount++;
        const ch = base + tm[1];
        if (!sites.has(ch)) sites.set(ch, { iface: m[2], guard, kind: key, file: rel });
      }
    }
  }
}

// guard census
const guards = new Map();
for (const v of sites.values()) guards.set(v.guard, (guards.get(v.guard) || 0) + 1);

console.log("=== INDEPENDENT RECOUNT ===");
console.log(`ao() call sites with a resolvable prefix : ${siteCount}`);
console.log(`method/event tuples seen                 : ${tupleCount}`);
console.log(`UNIQUE derived channels                  : ${sites.size}`);
console.log(`\nguard -> unique channels:`);
for (const [g, n] of [...guards].sort((a,b)=>b[1]-a[1])) console.log(`  ${g.padEnd(10)} ${n}`);

// top-frame-only guards, counted in channels
const topOnly = ["Ixe","PMr","vTi","nba"];
let to = 0; for (const [ch,v] of sites) if (topOnly.includes(v.guard)) to++;
console.log(`\nchannels guarded ONLY by top-frame check (${topOnly.join(",")}): ${to}`);

// which interfaces use them
const ifaceOf = new Set();
for (const v of sites.values()) if (topOnly.includes(v.guard)) ifaceOf.add(v.iface);
console.log(`  interfaces: ${[...ifaceOf].sort().join(", ")}`);

fs.writeFileSync(path.join(__dirname, "recount.json"), JSON.stringify({
  sites: siteCount, tuples: tupleCount, unique: sites.size,
  guards: [...guards].map(([g,n])=>({guard:g,n})),
  topFrameOnlyChannels: to,
  channels: [...sites].map(([ch,v])=>({channel:ch,...v})),
}, null, 2));
console.log("\nwrote recount.json");
