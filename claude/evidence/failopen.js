"use strict";
// Adversarial check on the highest-risk claims:
//  (1) is there ANY fail-open path to --no-sandbox / webSecurity:false ?
//  (2) does the LOCALHOST dev-override in the sender guard have a reachable setter?
//  (3) is `sandbox:!0` reached only from the artifact-preview window?
const fs = require("fs");
const path = require("path");
const SRC = path.join(process.env.TEMP, "claude-src");
function walk(d){const o=[];for(const n of fs.readdirSync(d)){const p=path.join(d,n);
  if(fs.statSync(p).isDirectory())o.push(...walk(p));else if(/\.(js|mjs)$/i.test(n))o.push(p);}return o;}
const files = walk(SRC);
const out = [];
const P=(s="")=>out.push(s);

P("=== CLAIM 1: any fail-open to unsandboxed renderer? ===");
const NO_SANDBOX = [/no-sandbox/gi, /webSecurity\s*:\s*!1/g, /webSecurity\s*:\s*false/g,
                    /nodeIntegration\s*:\s*!0/g, /contextIsolation\s*:\s*!1/g,
                    /sandbox\s*:\s*!1/g];
for (const re of NO_SANDBOX) {
  let total = 0; const where = [];
  for (const f of files) {
    const rel = path.relative(SRC,f).replace(/\\/g,"/");
    const t = fs.readFileSync(f,"utf8");
    re.lastIndex = 0; let m; let c = 0;
    while ((m = re.exec(t)) !== null) { c++; const s=Math.max(0,m.index-120);
      where.push(`      ${rel} @${m.index}: ...${t.slice(s,m.index+90).replace(/\s+/g," ")}`); }
    if (c) { total += c; }
  }
  P(`\n  ${re}  -> ${total} occurrence(s)`);
  for (const w of where.slice(0,6)) P(w);
}

P("\n\n=== CLAIM 2: isDeveloperApprovedDevUrlOverrideEnabled setter ===");
{
  let hits = 0;
  for (const f of files) {
    const rel = path.relative(SRC,f).replace(/\\/g,"/");
    const t = fs.readFileSync(f,"utf8");
    const i = t.indexOf("isDeveloperApprovedDevUrlOverrideEnabled");
    if (i < 0) continue;
    // show ASSIGNMENT sites only
    const assign = /(?:globalThis\.)?isDeveloperApprovedDevUrlOverrideEnabled\s*=/.exec(t);
    if (assign) {
      hits++;
      P(`\n  ASSIGNMENT in ${rel} @${assign.index}:`);
      P("    " + t.slice(Math.max(0,assign.index-420), assign.index+260).replace(/\s+/g," "));
    }
  }
  P(`\n  assignment sites found: ${hits}`);
  P(`  total textual occurrences (all files): ${(() => { let n=0; for (const f of files) { const t=fs.readFileSync(f,"utf8"); n += (t.match(/isDeveloperApprovedDevUrlOverrideEnabled/g)||[]).length; } return n; })()}`);
}

P("\n\n=== CLAIM 3: sandbox:!0 window identity ===");
{
  const f = files.find(x=>/index\.chunk-B2twxM5X\.js$/.test(x)) || files.find(x=>/index\.chunk-B2twxM5X/.test(x));
  if (f) {
    const t = fs.readFileSync(f,"utf8");
    let i=-1,c=0;
    while((i=t.indexOf("sandbox:!0",i+1))>=0 && c<4){ c++;
      P(`\n  --- ${path.basename(f)} @${i} ---`);
      P("    " + t.slice(Math.max(0,i-700), i+260).replace(/\s+/g," "));
    }
    P(`\n  total 'sandbox:!0' in this file: ${(t.match(/sandbox:!0/g)||[]).length}`);
  }
}

fs.writeFileSync(path.join(__dirname,"failopen.txt"), out.join("\n"));
console.log(out.join("\n"));
