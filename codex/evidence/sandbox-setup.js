"use strict";
// codex-windows-sandbox-setup.exe / -service.exe — what do they configure,
// and does the sandbox FAIL OPEN?
// Queue asks specifically: "does the sandbox setup fail open, the way
// Typeless's GPU-crash handler failed open to --no-sandbox?"
const fs = require("fs");
const path = require("path");
const ROOT = "C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.1007.2314.0_x64__2p2nqsd0c76g0\\app\\resources";

function runs(buf, min = 4) {
  const out = new Set(); let cur = "";
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i];
    if (c >= 0x20 && c < 0x7f) cur += String.fromCharCode(c);
    else { if (cur.length >= min) out.add(cur); cur = ""; }
  }
  return [...out];
}

const out = [];
const P = (s = "") => out.push(s);

for (const rel of ["codex-windows-sandbox-setup.exe", "codex-windows-sandbox-service.exe"]) {
  const buf = fs.readFileSync(path.join(ROOT, rel));
  const all = runs(buf, 4);
  P(`\n########## ${rel}  (${buf.length.toLocaleString()} bytes) ##########`);
  P(`method: ASCII printable-run sweep >= 4 chars; raw text, no encoded string pool; ${all.length} distinct runs`);

  const GROUPS = {
    "RUST SOURCE MODULES (crate paths)": /^[\w-]+[\/\\][\w\\/.-]+\.rs$/,
    "SANDBOX MECHANISM": /AppContainer|app.?container|MicIntegrity|low.?integrity|job.?object|AssignProcessToJobObject|CreateRestrictedToken|WinLowLabelSid|SE_GROUP_USE_DEFAULT_DENY|AddAceAllowedAce|SidTypeAll/i,
    "ACL / ACE / SECURITY DESCRIPTOR": /DACL|SACL|ConvertStringSecurityDescriptor|SetSecurityDescriptor|AddAccessAllowedAce|SetNamedSecurityInfo|icacls/i,
    "FIREWALL / NETWORK": /firewall|netsh|New-NetFirewallRule|AdvFirewall|INetFwPolicy|WinDivert|network.?policy/i,
    "USERS / GROUPS": /S-1-5-|BUILTIN|Users|Administrators|NT AUTHORITY|CreateWellKnownSid|LookupAccountName/i,
    "PIPE / IPC": /CreateNamedPipe|ConnectNamedPipe|\\\\\.\\pipe|NamedPipe|PIPE_|Duplex|MessagePipe/i,
    "ELEVATION / TOKEN": /runas|ShellExecuteEx|IsUserAnAdmin|elevat|AdjustTokenPrivileges|CreateProcessAsUser|DuplicateToken|SetTokenInformation/i,
    "REGISTRY": /HKEY_|RegOpenKey|RegSetValue|RegCreateKey|Software\\Classes|SOFTWARE\\Microsoft|CurrentVersion\\Run/i,
    "FAIL-OPEN SIGNALS": /fail.?open|default.?allow|permissive|best.?effort|ignore.?error|continue.?on.?error|non.?fatal|degrade|fallback|if.?error/i,
    "COMMAND EXEC POLICY": /exec_?policy|allow|deny|forbid|rule|matcher|policy/i,
    "CLI SUBCOMMANDS": /^(--[a-z][a-z0-9-]{2,30}|install|uninstall|setup|configure|status|verify)$/,
  };
  for (const [label, re] of Object.entries(GROUPS)) {
    const hits = [...new Set(all.filter((s) => re.test(s)))]
      .filter((s) => s.length < 180)
      .sort();
    P(`\n  --- ${label}: ${hits.length} ---`);
    for (const s of hits.slice(0, 40)) P("    " + s);
    if (hits.length > 40) P(`    ... (+${hits.length - 40})`);
  }
}

fs.writeFileSync(path.join(__dirname, "sandbox-setup-strings.txt"), out.join("\n"));
console.log(out.join("\n"));
