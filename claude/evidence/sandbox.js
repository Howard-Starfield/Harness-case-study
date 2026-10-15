"use strict";
// Sandbox / webPreferences posture + update & signing posture, derived fresh.
const fs = require("fs");
const path = require("path");
const SRC = path.join(process.env.TEMP, "claude-src");
function walk(d){const o=[];for(const n of fs.readdirSync(d)){const p=path.join(d,n);
  if(fs.statSync(p).isDirectory())o.push(...walk(p));else if(/\.(js|mjs)$/i.test(n))o.push(p);}return o;}
const files = walk(SRC);
const out = [];
const P = (s="")=>out.push(s);

const NEEDLES = {
  "commandLine appendSwitch (--no-sandbox etc)": /appendSwitch\(([^)]{0,80})\)/g,
  "app.commandLine flags":                  /commandLine\.(?:appendSwitch|hasSwitch|getSwitchValue)\([^)]*\)/g,
  "sandbox: literal":                       /sandbox\s*:\s*(!0|!1|true|false)/g,
  "webSecurity literal":                    /webSecurity\s*:\s*(!0|!1|true|false)/g,
  "contextIsolation literal":               /contextIsolation\s*:\s*(!0|!1|true|false)/g,
  "nodeIntegration literal":                /nodeIntegration\s*:\s*(!0|!1|true|false)/g,
  "allowRunningInsecureContent":            /allowRunningInsecureContent\s*:\s*[^,}]{0,30}/g,
  "webviewTag":                             /webviewTag\s*:\s*[^,}]{0,30}/g,
  "Content-Security-Policy":                /Content-Security-Policy[^"'`]{0,60}/gi,
  "setPermissionRequestHandler":            /setPermissionRequestHandler/g,
  "setWindowOpenHandler":                   /setWindowOpenHandler/g,
  "will-navigate":                          /will-navigate/g,
  "update / signature":                     /(?:Squirrel|autoUpdater|electron-updater|update\.electronjs|AppInstaller|MSIX|appinstallerupdate|\.nupkg|RELEASES|latest\.yml|blockmap)/gi,
};

P("=== SANDBOX / UPDATE CENSUS ===");
P(`corpus: ${files.length} .js/.mjs files under %TEMP%\\claude-src (extracted from app.asar)`);
P(`method: raw-text regex; occurrences counted, not lines (G6)`);
P();
for (const [label, re] of Object.entries(NEEDLES)) {
  const counts = new Map();
  let total = 0;
  for (const f of files) {
    const rel = path.relative(SRC, f).replace(/\\/g,"/");
    const t = fs.readFileSync(f, "utf8");
    re.lastIndex = 0; let m;
    while ((m = re.exec(t)) !== null) {
      total++;
      const key = (m[1] ?? m[0]).slice(0, 90);
      if (!counts.has(key)) counts.set(key, { n: 0, files: new Set() });
      const e = counts.get(key); e.n++; e.files.add(rel);
    }
  }
  P(`\n----- ${label}: ${total} occurrences -----`);
  if (total === 0) { P("   (0 occurrences in the .js corpus — scope: code only, locales excluded)"); continue; }
  for (const [k, v] of [...counts].sort((a,b)=>b[1].n-a[1].n).slice(0, 25))
    P(`   ${String(v.n).padStart(4)}x  ${k}   [${[...v.files].slice(0,3).join(", ")}${v.files.size>3?" +"+(v.files.size-3):""}]`);
}

fs.writeFileSync(path.join(__dirname, "sandbox-update.txt"), out.join("\n"));
console.log(out.join("\n"));
