"use strict";
// Claude Desktop 2.31226.1.0 — prompt-injection defence + agent-execution sandbox census.
// Occurrence counts (not lines) over raw decoded JS text.
// Every negative is paired with a positive control on the same corpus, same pass.
const fs = require("fs");
const SRC = process.env.TEMP + "\\claude-src";
const EQ = "=".repeat(80);

const files = [];
(function walk(d) {
  let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = d + "\\" + e.name;
    if (e.isDirectory()) walk(p);
    else if (/\.(js|mjs|cjs)$/i.test(e.name)) files.push(p);
  }
})(SRC);
let bytes = 0;
for (const f of files) bytes += fs.statSync(f).size;
console.log(EQ);
console.log("CLAUDE JS CORPUS: files=" + files.length + "  bytes=" + bytes.toLocaleString());
console.log(EQ);

function countAll(t, re) { re.lastIndex = 0; let n = 0; while (re.exec(t) !== null) { n++; if (re.lastIndex === 0) break; } return n; }

const GROUPS = {
  "A. PROMPT-INJECTION DEFENCES": [
    ["prompt injection",      /prompt[\s_-]?injection/gi],
    ["injection (bare)",      /\binjection\b/gi],
    ["indirect injection",    /indirect[\s_-]?inject/gi],
    ["jailbreak",             /\bjailbreak\w*/gi],
    ["untrusted",             /\buntrusted\b/gi],
    ["untrusted_content",     /untrusted[_-]?content/gi],
    ["sanitiz*",              /\bsanitiz\w*/gi],
    ["escap(e|ing) util",     /\bescapeHtml\b|\bescapeXml\b|\bxmlEscape/gi],
    ["CONTROL: sanitizeHtml", /\bsanitizeHtml\b/gi],
    ["CONTROL: invoke",       /\binvoke\(/g],
  ],
  "B. CONTENT TRUST MARKERS / DELIMITERS": [
    ["<system>",             /<system>/gi],
    ["<untrusted>",          /<untrusted>/gi],
    ["[INST]",               /\[INST\]/gi],
    ["antArtifact",          /antArtifact/gi],
    ["thinking block",        /thinking_?block|signature_delta|redacted_thinking/gi],
    ["is_error",              /\bis_error\b/gi],
    ["tool_result marker",    /tool_?result/gi],
    ["CONTROL: react",       /useState|useEffect/g],
  ],
  "C. AGENT EXECUTION SANDBOX": [
    ["cowork-svc",           /cowork[\s_-]?svc/gi],
    ["cowork (bare)",        /\bcowork\b/gi],
    ["Hyper-V",              /hyper-?v\b|\bvmcompute\b|\bvmms\b/gi],
    ["vhdx",                 /\.vhdx\b/gi],
    ["WSL",                  /\bwsl\.exe\b|\bwsl\b(?=\W)|preferWsl|WSL_DISTRO/gi],
    ["job object",           /CreateJobObject|AssignProcessToJobObject|job object/gi],
    ["restricted token",     /CreateRestrictedToken|restricted token|LogonUserWithToken/gi],
    ["AppContainer",         /AppContainer|PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES/gi],
    ["container/namespace",  /CreateNamespace|HANDLE_FLAG_PROTECT_FROM_CLOSE|seccomp/gi],
    ["--dangerously",        /dangerouslySkipPermissions|dangerously-skip-permissions/gi],
    ["bypassPermissions",    /bypassPermissions/gi],
    ["acceptEdits",          /acceptEdits/gi],
    ["permissionMode",       /permissionMode|permission_mode/gi],
    ["CONTROL: spawn",       /\bspawn\(/g],
  ],
  "D. TOOL PERMISSION MODEL": [
    ["canUseTool",           /canUseTool/gi],
    ["allowedTools",         /allowedTools|allowed_tools/gi],
    ["disallowedTools",      /disallowedTools|disallowed_tools/gi],
    ["additionalDirectories",/additionalDirectories|additional_director/gi],
    ["PreToolUse",           /PreToolUse|PreTool/gi],
    ["PostToolUse",          /PostToolUse|PostTool/gi],
    ["permission decision",  /permissionDecision|permission_decision/gi],
    ["auto-approve",         /autoApprove|auto_approve|auto-approve|alwaysAllow|always_allow/gi],
    ["tool block/deny",      /toolBlock|tool_block|denied_?tool|blockTool/gi],
    ["CONTROL: zod",         /\bz\.(string|number|boolean|object)\(/g],
  ],
  "E. MCP TRUST / TOOL POISONING": [
    ["tool poisoning",       /tool[\s_-]?poisoning|poisoned tool/gi],
    ["MCP annotations",      /annotations|readOnlyHint|destructiveHint/gi],
    ["tool description",     /tool_?description|description of the tool/gi],
    ["mcp server trust",     /trust\w*ed\s*(server|mcp)|untrustedServer|serverTrust/gi],
    ["oauth / auth",         /oauth|authorization_code/gi],
    ["CONTROL: mcp",         /\bmcp\b/gi],
  ],
  "F. OUTPUT / TOOL-USE ESCALATION GUARDS": [
    ["data exfil",           /exfiltrat\w*/gi],
    ["credential scan",      /secret\w*scan|scanForSecrets|credential scan/gi],
    ["path traversal guard", /path traversal|\.\.\/|\.\.\\\\/gi],
    ["allowed path check",   /isPathAllowed|pathAllowed|withinDirectory|isInside/gi],
    ["confirm dialog",       /confirm\(|confirmation/gi],
    ["CONTROL: dialog",      /showMessageBox/gi],
  ],
};

const grand = { inj: 0, sbx: 0 };
for (const gname of Object.keys(GROUPS)) {
  console.log("");
  console.log(EQ);
  console.log("== " + gname);
  console.log(EQ);
  for (const pair of GROUPS[gname]) {
    let tot = 0; const hit = new Map();
    for (const f of files) {
      let t; try { t = fs.readFileSync(f, "utf8"); } catch { continue; }
      const c = countAll(t, pair[1]);
      if (c) {
        tot += c;
        const r = f.slice(SRC.length + 1).replace(/\\/g, "/");
        hit.set(r, (hit.get(r) || 0) + c);
      }
    }
    const top = Array.from(hit.entries()).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 3);
    console.log("  " + pair[0].padEnd(24) + String(tot).padStart(7) + "  files=" + String(hit.size).padStart(4));
    for (const e of top) console.log("        " + e[0].padEnd(66) + e[1]);
  }
}
console.log("");
console.log("DONE");