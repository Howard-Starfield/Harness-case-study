"use strict";
// ASCII+UTF16 string harvest from the native binaries, filtered to
// IPC/privilege-relevant vocabulary. Static file read only.
const fs = require("fs");
const path = require("path");
const ROOT = "C:\\Program Files\\WindowsApps\\Claude_2.31226.1.0_x64__pzs8sxrjxfjjc\\app";

const PATTERNS = [
  /\\\\\.\\pipe\\/gi, /named.?pipe/gi, /CreateNamedPipe/gi, /ConnectNamedPipe/gi,
  /CreateFileW?\(/gi, /\\\\\.\\mailslot/gi,
  /LocalServer/gi,
  /LocalServer/gi, /Local\\/gi,
  /\bssh-|ssh2|libssh/gi,
  /\\\\\.\\pipe\\[^"\s\\]{0,80}/gi,
  /(?<![\w.])(?:claude|cowork|ant)[\w.-]{2,40}/gi,
  /token|auth|secret|password|passphrase|credential/gi,
  /elevation|admin|privilege|impersonate|AdjustTokenPrivileges|SeDebugPrivilege|runas|elevat/gi,
  /localhost:\d+|127\.0\.0\.1:\d+|\b\d{4,5}\b(?=\s*(?:port|listen))/gi,
  /Content-Security-Policy/gi,
  /x-msdownload|application\/octet-stream/gi,
];

function harvest(file, isWide) {
  const buf = fs.readFileSync(file);
  const out = new Set();
  if (isWide) {
    let cur = "";
    for (let i = 0; i + 1 < buf.length; i += 2) {
      const c = buf.readUInt16LE(i);
      if (c >= 0x20 && c < 0x7f) cur += String.fromCharCode(c);
      else { if (cur.length >= 5) out.add(cur); cur = ""; }
    }
  } else {
    let cur = "";
    for (let i = 0; i < buf.length; i++) {
      const c = buf[i];
      if (c >= 0x20 && c < 0x7f) cur += String.fromCharCode(c);
      else { if (cur.length >= 5) out.add(cur); cur = ""; }
    }
  }
  return [...out];
}

const TARGETS = [
  "resources\\cowork-svc.exe",
  "resources\\claude-ssh-broker.exe",
  "resources\\claude-ssh-proxy.exe",
  "resources\\claude-ssh-askpass.exe",
];

const lines = [];
for (const rel of TARGETS) {
  const p = path.join(ROOT, rel);
  lines.push(`\n########## ${rel} ##########`);
  lines.push(`method: ${fs.statSync(p).size} bytes, ASCII + UTF-16LE sweep, strings >= 5 chars`);
  const ascii = harvest(p, false);
  const wide = harvest(p, true);
  lines.push(`ascii strings>=5: ${ascii.length}   utf16le strings>=5: ${wide.length}`);
  for (const [label, set] of [["ASCII", ascii], ["UTF16", wide]]) {
    const hits = new Map();
    for (const s of set) {
      for (const re of PATTERNS) {
        re.lastIndex = 0;
        if (re.test(s)) {
          const k = s.length > 160 ? s.slice(0, 160) + "..." : s;
          hits.set(k, (hits.get(k) || 0) + 1);
          break;
        }
      }
    }
    lines.push(`--- ${label} hits: ${hits.size} distinct ---`);
    for (const [k, n] of [...hits].sort((a, b) => b[1] - a[1]).slice(0, 120)) lines.push(`  (${n}) ${k}`);
  }
}

fs.writeFileSync(path.join(__dirname, "native-strings.txt"), lines.join("\n"));
console.log(lines.join("\n"));
