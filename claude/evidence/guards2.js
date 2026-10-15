"use strict";
// Full text of the origin allowlist used by guards tv/Xh/Zua/XLi/twi/yTi/$lt/nHn/owi/$di,
// plus $A (used by Rya) and the dev-override flag definition.
const fs = require("fs");
const path = require("path");
const SRC = path.join(process.env.TEMP, "claude-src");
const BUILD = path.join(SRC, ".vite", "build");
function walk(d){const o=[];for(const n of fs.readdirSync(d)){const p=path.join(d,n);
  if(fs.statSync(p).isDirectory())o.push(...walk(p));else if(/\.(js|mjs)$/i.test(n))o.push(p);}return o;}
const files = walk(BUILD);

const out = [];
const grab = (label, re, t, file) => {
  const m = re.exec(t);
  if (!m) { out.push(`\n----- ${label} : NOT FOUND in ${file} -----`); return; }
  const open = t.indexOf("{", m.index);
  let d = 0, end = -1;
  for (let i = open; i < t.length; i++) { if (t[i]==="{") d++; else if(t[i]==="}"){d--;if(d===0){end=i;break;}} }
  out.push(`\n----- ${label}  [${file}] -----`);
  out.push(t.slice(m.index, end + 1));
};

for (const f of files) {
  const rel = path.relative(SRC, f).replace(/\\/g,"/");
  const t = fs.readFileSync(f, "utf8");

  // full allowlist guard (pick the longest variant we can find)
  if (/function tv\(/.test(t)) grab("GUARD tv (full)", /function tv\(/, t, rel);
  // $A host allowlist
  const ia = t.search(/function \$A\(/);
  if (ia >= 0) grab("$A (host allowlist used by Rya)", /function \$A\(/, t, rel);
  // dev override flag
  const id = t.indexOf("isDeveloperApprovedDevUrlOverrideEnabled");
  if (id >= 0) {
    out.push(`\n----- isDeveloperApprovedDevUrlOverrideEnabled : first definition [${rel}] -----`);
    // find "var X=...isDeveloper..." or assignment
    const s = Math.max(0, id - 300);
    out.push(t.slice(s, id + 200));
    break;
  }
}

// distinct origins in the allowlist
const all = files.map(f=>fs.readFileSync(f,"utf8")).join("\n");
const origins = new Set((all.match(/https?:\/\/[a-z0-9.-]*claude[a-z0-9.-]*/gi)||[]).map(s=>s.toLowerCase()));
out.push("\n----- distinct claude.* origins seen in corpus -----");
[...origins].sort().forEach(o=>out.push("  " + o));

const schem = new Set((all.match(/[a-z-]+:\/\/localhost/g)||[]));
out.push("\n----- custom scheme origins -----");
[...schem].sort().forEach(o=>out.push("  " + o));

fs.writeFileSync(path.join(__dirname,"guards-full.txt"), out.join("\n"));
console.log(out.join("\n"));
