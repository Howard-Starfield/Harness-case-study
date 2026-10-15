"use strict";
// Sandbox census across cloned LLM harnesses.
//
// METHOD: every hit is classified into
//   CODE   - implementation file (not .md, not under docs/)
//   DOC    - documentation (.md, /docs/, /doc/, *.rst, *.txt, /examples, /samples)
// This distinction is load-bearing: a README sentence saying "sandboxed" is not a sandbox.
// Every negative is calibrated with a positive control on the SAME repo, same pass.

const fs = require("fs");
const ROOT = process.env.TEMP + "\\harness-sandbox";
const EQ = "=".repeat(82);

const REPOS = ["jan", "atomic-agents", "smolagents", "openhands", "goose", "open-interpreter"];

const DOC_EXT = /\.(md|mdx|rst|txt|adoc)$/i;
const DOC_PATH = /(^|[\\/])(docs?|documentation|website|site|examples?|samples?|tutorials?|benchmarks?|evals?|tests?)[\\/]|\.github[\\/]/i;

const isDoc = function (rel) {
  return DOC_EXT.test(rel) || DOC_PATH.test(rel);
};

// needles grouped by what they actually prove
const GROUPS = [
  ["macOS seatbelt", [
    [/seatbelt/gi, /sandbox-exec/gi, /sandbox_init/gi, /\bSBPL\b/g, /SANDBOX_PROFILE/gi]
  ]],
  ["Linux namespaces / LSM", [
    [/\bbwrap\b|bubblewrap/gi, /\bnsjail\b/gi, /\bfirejail\b/gi],
    [/\bLandlock\b/gi, /\bseccomp\b/gi, /\bAppArmor\b/gi, /\bSELinux\b/gi],
    [/\bunshare\b|CLONE_NEWUSER|CLONE_NEWNET/gi, /\bchroot\b/gi]
  ]],
  ["Container / VM runtime", [
    [/\bdocker\b/gi, /\bpodman\b/gi, /\bgvisor\b|\brunsc\b/gi],
    [/\bfirecracker\b|\bmicroVM\b|\bmicrovm\b|\bcloudhypervisor\b/gi],
    [/\be2b\b|\bdaytona\b|\bmodal\b.*sandbox|\bblaxel\b/gi]
  ]],
  ["Windows containment", [
    [/CreateJobObject|AssignProcessToJobObject|JOB_OBJECT_LIMIT/gi],
    [/CreateRestrictedToken|LogonUserWithToken|SetTokenInformation/gi],
    [/AppContainer|PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES|CreateAppContainerProfile/gi]
  ]],
  ["Language-level sandboxing", [
    [/RestrictedPython|safe_eval|safeval|RestrictedEnvironment/gi],
    [/vm2\b|isolated-vm|quickjs/gi, /Deno\.Command|deno_permissions|Permissions\./gi]
  ]],
  ["Named 'sandbox' concept", [
    [/\bsandbox\b/gi],
    [/\bsandboxed\b/gi, /\bsandboxing\b/gi]
  ]],
  ["Approval / permission gate", [
    [/\bapproval\b|\bapprove\b|\brequiresApproval\b/gi],
    [/\bpermission(s)?\b/gi],
    [/allowlist|allow_list|whitelist|denylist|blocklist/gi],
    [/dangerously|--yes\b|--force\b|auto_approve|autoApprove|yolo\b/gi]
  ]],
  ["PROMPT-INJECTION handling", [
    [/prompt[ _-]?injection/gi, /\bindirect injection\b/gi, /\buntrusted\b/gi, /\bjailbreak\b/gi]
  ]],
  ["CONTROLS (must be non-zero)", [
    [/subprocess|Popen|child_process|exec\(|spawn\(|fork\(|System\.Diagnostics\.Process/gi]
  ]],
];

function countAll(t, re) { re.lastIndex = 0; let n = 0; while (re.exec(t) !== null) { n++; if (re.lastIndex === 0) break; } return n; }

function walkCode(dir, out, isDocDir) {
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    if (e.name === ".git" || e.name === "node_modules" || e.name === "target" ||
        e.name === "dist" || e.name === "build" || e.name === "__pycache__" ||
        e.name === ".venv" || e.name === "vendor") continue;
    const p = dir + "\\" + e.name;
    if (e.isDirectory()) { walkCode(p, out, isDocDir || DOC_PATH.test(e.name)); continue; }
    const rel = p.slice(dir.length + 1).replace(/\\/g, "/");
    out.push({ p: p, rel: rel, doc: isDocDir || isDoc(rel) });
  }
}

for (const repo of REPOS) {
  const dir = ROOT + "\\" + repo;
  if (!fs.existsSync(dir)) { console.log("\n" + EQ + "\n!! MISSING " + repo + "\n" + EQ); continue; }

  const entries = [];
  walkCode(dir, entries, false);
  const textFiles = entries.filter(function (e) {
    return /\.(js|mjs|cjs|jsx|ts|tsx|py|rs|go|java|kt|rb|php|cs|c|cc|cpp|h|hpp|swift|sh|bash|zsh|ps1|toml|yaml|yml|json)$/i.test(e.rel);
  });

  const sha = (function () {
    try { return require("child_process").execSync('git -C "' + dir + '" rev-parse HEAD', { encoding: "utf8" }).trim(); }
    catch { return "?"; }
  })();
  const nCode = textFiles.filter(function (e) { return !e.doc; }).length;
  const nDoc = textFiles.length - nCode;

  console.log("");
  console.log(EQ);
  console.log("== " + repo.toUpperCase() + "   commit=" + sha.slice(0, 16));
  console.log("   source-ish files: CODE=" + nCode + "  DOC=" + nDoc);
  console.log(EQ);

  // cache contents
  const cache = textFiles.map(function (e) {
    try { return { e: e, t: fs.readFileSync(e.p, "utf8") }; } catch { return null; }
  }).filter(Boolean);

  for (const grp of GROUPS) {
    const lines = [];
    for (const sub of grp[1]) {
      let codeN = 0, codeF = 0, docN = 0;
      const codeHits = new Map();
      for (const c of cache) {
        let tot = 0;
        for (const re of sub) tot += countAll(c.t, re);
        if (tot > 0) {
          if (c.e.doc) docN += tot;
          else { codeN += tot; codeF++; codeHits.set(c.e.rel, (codeHits.get(c.e.rel) || 0) + tot); }
        }
      }
      const pat = sub.map(function (r) { return r.source; }).join(" | ");
      lines.push([pat, codeN, codeF, docN, codeHits]);
    }
    for (const L of lines) {
      const mark = L[1] === 0 && L[3] === 0 ? "  --" : (L[1] === 0 ? " DOC" : "CODE");
      console.log("  " + mark + "  " + L[0].slice(0, 62).padEnd(64) + "code=" + String(L[1]).padStart(5) + "/" + String(L[2]).padStart(4) + "f  doc=" + String(L[3]).padStart(5));
      if (L[1] > 0) {
        const top = Array.from(L[4].entries()).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 3);
        for (const t of top) console.log("            " + t[0].slice(0, 74).padEnd(76) + t[1]);
      }
    }
  }
}
console.log("");
console.log("DONE");