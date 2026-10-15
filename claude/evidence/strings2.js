"use strict";
// Targeted extraction: named pipes / sockets / listeners / elevation in cowork-svc.exe
const fs = require("fs");
const path = require("path");
const p = "C:\\Program Files\\WindowsApps\\Claude_2.31226.1.0_x64__pzs8sxrjxfjjc\\app\\resources\\cowork-svc.exe";
const buf = fs.readFileSync(p);

function harvest(isWide) {
  const out = new Set();
  let cur = "";
  if (isWide) {
    for (let i = 0; i + 1 < buf.length; i += 2) {
      const c = buf.readUInt16LE(i);
      if (c >= 0x20 && c < 0x7f) cur += String.fromCharCode(c);
      else { if (cur.length >= 4) out.add(cur); cur = ""; }
    }
  } else {
    for (let i = 0; i < buf.length; i++) {
      const c = buf[i];
      if (c >= 0x20 && c < 0x7f) cur += String.fromCharCode(c);
      else { if (cur.length >= 4) out.add(cur); cur = ""; }
    }
  }
  return [...out];
}
const all = [...harvest(false), ...harvest(true)];

const groups = {
  "NAMED PIPES":        /\\\\\.\\pipe|pipe[/\\]|CreateNamedPipe|ConnectNamedPipe|ImpersonateNamedPipeClient|PIPE_ACCESS/i,
  "SOCKETS/LISTEN":     /127\.0\.0\.1|localhost|0\.0\.0\.0|TcpListener|UnixListener|bind\(|listen\(|\blisten\b|WSASocket/i,
  "ELEVATION":          /IsElevated|elevat|runas|admin|SeDebugPrivilege|AdjustTokenPrivileges|ShellExecuteEx|requireAdministrator|highestAvailable/i,
  "SERVICE CONTROL":    /StartServiceCtrlDispatcher|RegisterServiceCtrlHandler|SERVICE_|SCManager|ControlService/i,
  "COM/DCOM/WMI":       /CoCreateInstance|CLSID|WMI|IWbem|winmgmts|ROT13/i,
  "SSH BANNER":         /SSH-2\.0-|SSH-1\.99|userauth|server-sig-algs|kex_exchange/i,
  "PROCESS LAUNCH":     /CreateProcessW?|ShellExecuteW?|cmd\.exe|powershell|Start-Process/i,
  "FILE/DIR":           /cowork|claude|smol-bin|\.vhdx|AppData|ProgramData/i,
};

const out = [];
out.push(`=== cowork-svc.exe targeted string groups ===`);
out.push(`file size ${buf.length} bytes; corpus = ASCII+UTF16LE printable runs >= 4 chars`);
out.push(`total distinct runs: ${all.length}`);
for (const [label, re] of Object.entries(groups)) {
  const hits = all.filter((s) => re.test(s));
  const uniq = [...new Set(hits)].sort();
  out.push(`\n----- ${label} : ${uniq.length} distinct -----`);
  for (const h of uniq.slice(0, 70)) out.push("  " + (h.length > 200 ? h.slice(0,200)+"..." : h));
  if (uniq.length > 70) out.push(`  ... (+${uniq.length-70} more)`);
}

fs.writeFileSync(path.join(__dirname,"cowork-strings.txt"), out.join("\n"));
console.log(out.join("\n"));
