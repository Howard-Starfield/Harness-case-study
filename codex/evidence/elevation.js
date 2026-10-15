"use strict";
// elevation_service.exe — the highest-value question in the queue.
// What is its IPC surface, and who can drive it?
// Static only: PE parse + string harvest + calibration controls.
const fs = require("fs");
const path = require("path");
const ROOT = "C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.1007.2314.0_x64__2p2nqsd0c76g0\\app";

function harvest(buf, min = 5, wide = false) {
  const out = new Set();
  let cur = "";
  if (wide) {
    for (let i = 0; i + 1 < buf.length; i += 2) {
      const c = buf.readUInt16LE(i);
      if (c >= 0x20 && c < 0x7f) cur += String.fromCharCode(c);
      else { if (cur.length >= min) out.add(cur); cur = ""; }
    }
  } else {
    for (let i = 0; i < buf.length; i++) {
      const c = buf[i];
      if (c >= 0x20 && c < 0x7f) cur += String.fromCharCode(c);
      else { if (cur.length >= min) out.add(cur); cur = ""; }
    }
  }
  return [...out];
}

const out = [];
const P = (s = "") => out.push(s);

const TARGETS = [
  ["elevation_service.exe", path.join(ROOT, "elevation_service.exe")],
  ["elevated_tracing_service.exe", path.join(ROOT, "elevated_tracing_service.exe")],
  ["codex-windows-sandbox-service.exe", path.join(ROOT, "resources", "codex-windows-sandbox-service.exe")],
  ["codex-windows-sandbox-setup.exe", path.join(ROOT, "resources", "codex-windows-sandbox-setup.exe")],
];

const GROUPS = {
  "NAMED PIPES": /pipe/i,
  "PIPE NAME LITERALS": /\\\\\.\\pipe[\w.-]{0,60}|\\\\\.\\pipe/i,
  "SOCKETS / LISTEN": /\b127\.0\.0\.1\b|\blocalhost\b|\b0\.0\.0\.0\b|AF_UNIX|AF_INET|WSASocket|bind\(|listen\(|accept\(/i,
  "RPC / NAMED PIPE PROTO": /CreateNamedPipe|ConnectNamedPipe|CallNamedPipe|WaitNamedPipe|TransactNamedPipe|impersonat/i,
  "IPC MECHANISMS": /CreateFileW?|\\\\\.\\pipe| mailslot|SharedMemory|file mapping|CreateFileMapping|OpenFileMapping/i,
  "ELEVATION": /ShellExecuteEx|runas|IsUserAnAdmin|elevat|administrator|TOKEN_ELEVATION|AdjustTokenPrivileges|SetTokenInformation|CreateProcessAsUser|DuplicateToken/i,
  "TOKEN / AUTH": /token|auth|verify|signature|hmac|sha256|certificate|thumbprint/i,
  "SERVICE": /StartServiceCtrlDispatcher|RegisterServiceCtrlHandler|SERVICE_WIN32|SCManager|OpenSCManager|ControlService/i,
  "COM / RPC": /CoCreateInstance|CLSIDFromProgID|ole32|midl|__RPC|interface/i,
  "SANDBOX": /sandbox|AppContainer|low.?integrity|MicIntegrity|job object|AssignProcessToJobObject|CreateAppContainer/i,
};

for (const [name, p] of TARGETS) {
  if (!fs.existsSync(p)) { P(`\n########## ${name} : MISSING ##########`); continue; }
  const buf = fs.readFileSync(p);
  P(`\n########## ${name}  (${buf.length.toLocaleString()} bytes) ##########`);
  P(`method: ASCII+UTF16LE printable-run sweep, runs >= 5 chars; raw text, no encoded string pool`);
  const a = harvest(buf, 5, false), w = harvest(buf, 5, true);
  P(`ascii runs: ${a.length}   utf16 runs: ${w.length}`);
  const all = [...new Set([...a, ...w])];
  for (const [g, re] of Object.entries(GROUPS)) {
    const hits = [...new Set(all.filter((s) => re.test(s)))];
    // keep the informative ones
    const keep = hits.filter((s) => {
      if (s.length > 200) return false;
      if (/^https?:\/\//.test(s)) return false;
      return true;
    }).sort();
    P(`\n  --- ${g}: ${keep.length} ---`);
    for (const s of keep.slice(0, 45)) P("    " + s);
    if (keep.length > 45) P(`    ... (+${keep.length - 45})`);
  }
}

fs.writeFileSync(path.join(__dirname, "elevation-strings.txt"), out.join("\n"));
console.log(out.join("\n"));
