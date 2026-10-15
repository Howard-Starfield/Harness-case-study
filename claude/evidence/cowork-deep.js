"use strict";
// Pin down: (a) the cowork-win32-service named pipe name,
// (b) the Go build info / toolchain of each native binary,
// (c) how the JS side spawns & talks to cowork-svc.exe.
const fs = require("fs");
const path = require("path");
const ROOT = "C:\\Program Files\\WindowsApps\\Claude_2.31226.1.0_x64__pzs8sxrjxfjjc\\app";

function harvest(buf, min = 4) {
  const out = new Set(); let cur = "";
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i];
    if (c >= 0x20 && c < 0x7f) cur += String.fromCharCode(c);
    else { if (cur.length >= min) out.add(cur); cur = ""; }
  }
  return [...out];
}

const out = [];
out.push("=== (a) cowork-svc.exe : pipe / path / config strings ===");
{
  const buf = fs.readFileSync(path.join(ROOT, "resources", "cowork-svc.exe"));
  const all = harvest(buf);
  const pipe = all.filter((s) => /cowork[-_.\\\/]|claude[-_.\\\/]|smol|vhdx|\\\\\.\\pipe|\.sock|\.sock\b/i.test(s));
  const uniq = [...new Set(pipe)].sort();
  out.push(`  candidates: ${uniq.length}`);
  for (const s of uniq) {
    if (s.length > 300) continue;
    if (/^C:\/Users\/runneradmin\/go\/pkg\/mod\/(github|golang|gvisor|google)/.test(s)) continue;
    out.push("  " + s);
  }
  // Go build info
  const bi = buf.indexOf(Buffer.from("\xff Go buildinf:", "latin1"));
  out.push(`\n  Go buildinfo marker present: ${bi >= 0}`);
  const goVer = buf.indexOf(Buffer.from("go1.", "latin1"));
  if (goVer >= 0) {
    const seg = buf.slice(goVer, goVer + 20).toString("latin1");
    out.push(`  go version string near buildinfo: ${seg.split("\0")[0]}`);
  }
  const paths = all.filter((s) => /^(C|G):\/a\/apps\/apps\/packages\/desktop\/[^ ]{4,90}\.go$/.test(s));
  out.push(`  vendor source files embedded (first 40):`);
  for (const p of [...new Set(paths)].sort().slice(0, 40)) out.push("    " + p);
}

out.push("\n=== (b) toolchain fingerprint per native binary ===");
for (const rel of ["resources\\cowork-svc.exe","resources\\claude-ssh-broker.exe","resources\\claude-ssh-proxy.exe","resources\\claude-ssh-askpass.exe","resources\\chrome-native-host.exe"]) {
  const buf = fs.readFileSync(path.join(ROOT, rel));
  const all = harvest(buf, 6);
  const isGo = all.some((s) => /go1\.\d+/.test(s)) || buf.includes(Buffer.from("\xff Go buildinf:", "latin1"));
  const isRust = all.some((s) => /rustc|registry\/src\/.*rs|cargo/i.test(s));
  const isDotNet = all.some((s) => /mscoree\.dll|_CorExeMain|\.NETFramework/i.test(s));
  const goV = all.find((s) => /^go1\.\d+(\.\d+)?$/.test(s));
  const rustV = all.find((s) => /^rustc \d/.test(s));
  out.push(`  ${rel.padEnd(34)} go=${isGo} rust=${isRust} dotnet=${isDotNet}  goVer=${goV || "-"}  rustVer=${(rustV||"-").slice(0,40)}`);
}

out.push("\n=== (c) JS references to cowork-svc / ssh broker ===");
{
  const SRC = path.join(process.env.TEMP, "claude-src");
  function walk(d){const o=[];for(const n of fs.readdirSync(d)){const p=path.join(d,n);
    if(fs.statSync(p).isDirectory())o.push(...walk(p));else if(/\.(js|mjs)$/i.test(n))o.push(p);}return o;}
  const files = walk(SRC);
  const needles = ["cowork-svc","claude-ssh-broker","claude-ssh-proxy","claude-ssh-askpass","smol-bin","chrome-native-host","\\\\\\\\.\\\\pipe"];
  const census = new Map();
  for (const f of files) {
    const rel = path.relative(SRC, f).replace(/\\/g,"/");
    const t = fs.readFileSync(f, "utf8");
    for (const nd of needles) {
      let c = 0, i = -1;
      while ((i = t.indexOf(nd, i + 1)) >= 0) c++;
      if (c) {
        const k = `${nd}`;
        if (!census.has(k)) census.set(k, []);
        census.get(k).push({ rel, c });
      }
    }
  }
  for (const [nd, list] of census) {
    const tot = list.reduce((a,x)=>a+x.c,0);
    out.push(`\n  "${nd}" -> ${tot} occurrences across ${list.length} files`);
    for (const x of list.sort((a,b)=>b.c-a.c).slice(0, 8)) out.push(`      ${String(x.c).padStart(4)}  ${x.rel}`);
  }
  // context around cowork-svc spawn
  for (const f of files) {
    const rel = path.relative(SRC, f).replace(/\\/g,"/");
    const t = fs.readFileSync(f, "utf8");
    const i = t.indexOf("cowork-svc");
    if (i >= 0) {
      out.push(`\n  ---- spawn context in ${rel} @${i} ----`);
      out.push("  " + t.slice(Math.max(0,i-700), i+500).replace(/\s+/g," "));
      break;
    }
  }
}

fs.writeFileSync(path.join(__dirname, "cowork-deep.txt"), out.join("\n"));
console.log(out.join("\n"));
