"use strict";
// Per-file evidence for the sandbox primitives, with a code snippet per hit,
// so 'enforced in an implementation file' can be distinguished from
// 'mentioned in a document' or 'vendored third-party code'.
const fs = require("fs");
const cp = require("child_process");
const ROOT = process.env.TEMP + "\\harness-sandbox";
const EQ = "=".repeat(84);

const REPOS = ["jan", "atomic-agents", "smolagents", "openhands", "goose", "open-interpreter"];

// the primitives that would constitute real containment
const PRIMS = [
  ["seatbelt",    /seatbelt|sandbox-exec|sandbox_init/gi],
  ["bubblewrap",  /\bbwrap\b|bubblewrap/gi],
  ["landlock",    /\bLandlock\b/gi],
  ["e2b",         /\be2b\b/gi],
  ["docker",      /\bdocker\b/gi],
  ["jobobject",   /CreateJobObject|AssignProcessToJobObject|JOB_OBJECT_LIMIT/gi],
  ["appcontainer",/AppContainer|PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES|CreateAppContainerProfile/gi],
  ["rstonly",     /nsjail|firejail|seccomp/gi],
];

const SRC_EXT = /\.(js|mjs|cjs|jsx|ts|tsx|py|rs|go|java|kt|rb|php|cs|swift|sh)$/i;
const DOC_EXT = /\.(md|mdx|rst)$/i;
const VENDOR = /(^|\/)(node_modules|target|dist|build|site-packages|vendor|\.venv|third_party|3rdparty|external|extensions\/node_modules)\//i;

function walk(dir, out, depth) {
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    if (e.name === ".git" || e.name === "__pycache__") continue;
    const p = dir + "\\" + e.name;
    if (e.isDirectory()) { if (depth < 14) walk(p, out, depth + 1); continue; }
    const base = e.name;
    const rel = base;
    out.push({ p: p, rel: rel, doc: DOC_EXT.test(base), src: SRC_EXT.test(base) });
  }
}

function countAll(t, re) { re.lastIndex = 0; let n = 0; while (re.exec(t) !== null) { n++; if (re.lastIndex === 0) break; } return n; }
function snip(t, re, win) {
  re.lastIndex = 0;
  const m = re.exec(t);
  if (!m) return "";
  const s = Math.max(0, m.index - win);
  return t.slice(s, m.index + win).replace(/\s+/g, " ");
}

for (const repo of REPOS) {
  const dir = ROOT + "\\" + repo;
  if (!fs.existsSync(dir)) continue;
  const sha = cp.execSync('git -C "' + dir + '" rev-parse HEAD', { encoding: "utf8" }).trim();

  // build path-relative list
  const rels = [];
  (function rec(d, prefix) {
    let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.name === ".git" || e.name === "__pycache__") continue;
      const p = d + "\\" + e.name;
      const r = prefix ? prefix + "/" + e.name : e.name;
      if (e.isDirectory()) rec(p, r); else rels.push({ p: p, r: r });
    }
  })(dir, "");

  console.log("");
  console.log(EQ);
  console.log("== " + repo.toUpperCase() + "  commit=" + sha.slice(0, 16));
  console.log(EQ);

  for (const [name, re] of PRIMS) {
    let codeN = 0, codeF = 0, docN = 0, vendN = 0;
    const top = [];
    for (const f of rels) {
      const isDoc = DOC_EXT.test(f.r);
      const isSrc = SRC_EXT.test(f.r);
      if (!isDoc && !isSrc) continue;
      let t; try { t = fs.readFileSync(f.p, "utf8"); } catch { continue; }
      const c = countAll(t, re);
      if (!c) continue;
      if (isDoc) { docN += c; continue; }
      if (VENDOR.test(f.r)) { vendN += c; continue; }
      codeN += c; codeF++;
      top.push([f.r, c, snip(t, re, 150)]);
    }
    const status = codeN === 0 && docN === 0 ? "ABSENT   " : (codeN === 0 ? "DOC-ONLY " : "IN-CODE   ");
    console.log("\n  [" + status + "] " + name + "   first-party-code=" + codeN + "/" + codeF + "f   docs=" + docN + "   vendored=" + vendN);
    for (const t of top.slice(0, 4)) {
      console.log("      " + t[0].slice(0, 92));
      console.log("         > " + t[2].slice(0, 300));
    }
  }
}
console.log("");
console.log("DONE");