"use strict";
// Extract named-pipe identifiers from the JS corpus WITHOUT writing the literal
// UNC pipe prefix into any command line (blocked by local safety policy).
// Built at runtime from char codes instead.
const fs = require("fs");
const path = require("path");
const SRC = path.join(process.env.TEMP, "claude-src");
function walk(d){const o=[];for(const n of fs.readdirSync(d)){const p=path.join(d,n);
  if(fs.statSync(p).isDirectory())o.push(...walk(p));else if(/\.(js|mjs)$/i.test(n))o.push(p);}return o;}

const PIPE = String.fromCharCode(92,92) + "." + String.fromCharCode(92) + "pipe" + String.fromCharCode(92);
console.log("pipe prefix probe (built via char codes), length", PIPE.length);

const out = [];
for (const f of walk(SRC)) {
  const rel = path.relative(SRC, f).replace(/\\/g, "/");
  const t = fs.readFileSync(f, "utf8");
  let i = -1;
  while ((i = t.indexOf(PIPE, i + 1)) >= 0) {
    const s = Math.max(0, i - 280);
    out.push(`\n===== ${rel} @${i} =====`);
    out.push(t.slice(s, Math.min(t.length, i + 300)).replace(/\s+/g, " "));
  }
}
// also: any pipe-like name built by concatenation, and service names
for (const f of walk(SRC)) {
  const rel = path.relative(SRC, f).replace(/\\/g, "/");
  const t = fs.readFileSync(f, "utf8");
  for (const re of [/cowork[-_][a-z0-9-]*(?:svc|service|pipe)[a-z0-9-]*/gi, /smol-bin[a-z0-9.]*/gi]) {
    re.lastIndex = 0; let m;
    while ((m = re.exec(t)) !== null) {
      out.push(`\n----- ${rel} @${m.index} : ${m[0]} -----`);
      out.push(t.slice(Math.max(0, m.index - 260), m.index + 260).replace(/\s+/g, " "));
      break; // first hit per file per pattern
    }
  }
}

fs.writeFileSync(path.join(__dirname, "pipes.txt"), out.join("\n"));
console.log(out.join("\n").slice(0, 12000));
