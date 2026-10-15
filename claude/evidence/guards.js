"use strict";
// What do the 16 sender guards actually DO?
// An interface's 3rd arg to ao() is its sender guard. If a guard is a
// rubber stamp, the whole IPC surface is unvalidated. Rebuild each from source.
const fs = require("fs");
const path = require("path");
const SRC = path.join(process.env.TEMP, "claude-src");
const BUILD = path.join(SRC, ".vite", "build");

function walk(d){const o=[];for(const n of fs.readdirSync(d)){const p=path.join(d,n);
  if(fs.statSync(p).isDirectory())o.push(...walk(p));else if(/\.(js|mjs)$/i.test(n))o.push(p);}return o;}

const main = walk(BUILD).filter(f=>/index\.chunk-EzXl5k4A\.js$/.test(f));
const t = fs.readFileSync(main[0], "utf8");

const GUARDS = ["tv","Xh","Zua","Qot","XLi","nba","twi","vTi","Ixe","$0i","PMr","yTi","$lt","nHn","owi","$di"];

function showDef(name) {
  // function NAME(...){...}  |  NAME=e=>{...}  |  NAME=function(...){...}
  const pats = [
    new RegExp(`function ${name.replace(/\$/g,"\\$")}\\s*\\([^)]*\\)\\s*\\{`),
    new RegExp(`\\b${name.replace(/\$/g,"\\$")}\\s*=\\s*(?:async\\s*)?(?:function\\s*\\([^)]*\\)|\\([^)]*\\)\\s*=>|[A-Za-z_$][\\w$]*\\s*=>)\\s*\\{`),
  ];
  for (const re of pats) {
    const m = re.exec(t);
    if (!m) continue;
    const start = m.index;
    // balance braces from the opening {
    const open = t.indexOf("{", m.index);
    let d = 0, end = -1;
    for (let i = open; i < t.length; i++) {
      if (t[i] === "{") d++;
      else if (t[i] === "}") { d--; if (d === 0) { end = i; break; } }
    }
    return t.slice(start, end + 1);
  }
  return null;
}

const out = [];
out.push("=== SENDER GUARD DEFINITIONS (verbatim from index.chunk-EzXl5k4A.js) ===");
for (const g of GUARDS) {
  const d = showDef(g);
  out.push(`\n----- ${g} -----`);
  out.push(d ? d.slice(0, 700) : "  <<definition not found as standalone function — may be imported>>");
}

// also: Rya used by the ipcMain.handle wrapper Aka
const ri = t.indexOf("function Rya(");
out.push("\n\n----- Rya (used by Aka = validated ipcMain.handle wrapper) -----");
if (ri >= 0) {
  const open = t.indexOf("{", ri); let d = 0, end = -1;
  for (let i = open; i < t.length; i++) { if (t[i]==="{") d++; else if(t[i]==="}"){d--;if(d===0){end=i;break;}} }
  out.push(t.slice(ri, end + 1));
} else out.push("  not found");

fs.writeFileSync(path.join(__dirname, "guards.txt"), out.join("\n"));
console.log(out.join("\n"));
