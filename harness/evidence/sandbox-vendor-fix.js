"use strict";
// Follow-up: correct the vendor filter (open-interpreter bundles codex-rs), then
// determine, per harness, WHERE containment is actually decided.
const fs = require("fs");
const cp = require("child_process");
const ROOT = process.env.TEMP + "\\harness-sandbox";
const EQ = "=".repeat(84);

// Vendored third-party trees that must not be attributed to the host project.
const VENDOR_ROOTS = [
  "codex-rs/",            // OpenAI Codex CLI, vendored into open-interpreter
  "third_party/", "3rdparty/", "thirdparty/", "external/", "vendor/",
  "node_modules/", "site-packages/", ".venv/", "target/", "dist/", "build/",
];

function classify(rel) {
  if (VENDOR_ROOTS.some(function (v) { return rel.startsWith(v) || rel.includes("/" + v); })) return "VENDOR";
  if (/\.(md|mdx|rst)$/i.test(rel)) return "DOC";
  if (/\.(js|mjs|cjs|jsx|ts|tsx|py|rs|go|java|kt|rb|php|cs|swift|sh)$/i.test(rel)) return "CODE";
  return null;
}

function walk(dir, out, prefix) {
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    if (e.name === ".git" || e.name === "__pycache__") continue;
    const p = dir + "\\" + e.name;
    const r = prefix ? prefix + "/" + e.name : e.name;
    if (e.isDirectory()) walk(p, out, r); else out.push({ p: p, r: r });
  }
}

const PRIMS = [
  ["seatbelt",    /seatbelt|sandbox-exec|sandbox_init/gi],
  ["bubblewrap",  /\bbwrap\b|bubblewrap/gi],
  ["landlock",    /\bLandlock\b/gi],
  ["e2b",         /\be2b\b/gi],
  ["docker exec", /\bdocker\s+(exec|run|create)\b/gi],
  ["jobobject",   /CreateJobObject|AssignProcessToJobObject|JOB_OBJECT_LIMIT/gi],
  ["appcontainer",/CreateAppContainerProfile|PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES|appcontainer_common/gi],
];

const TARGETS = ["jan", "atomic-agents", "smolagents", "openhands", "goose", "open-interpreter"];

console.log(EQ);
console.log("PART 1 - vendor audit (is the big sandbox surface actually the host project's?)");
console.log(EQ);
for (const repo of TARGETS) {
  const dir = ROOT + "\\" + repo;
  if (!fs.existsSync(dir)) continue;
  const rels = []; walk(dir, rels, "");
  const byKind = { CODE: 0, DOC: 0, VENDOR: 0, SKIP: 0 };
  const vendRoots = new Map();
  for (const f of rels) {
    const k = classify(f.r) || "SKIP";
    byKind[k]++;
    if (k === "VENDOR") {
      const top = f.r.split("/")[0] + (f.r.split("/").length > 1 ? "/" + f.r.split("/")[1] : "");
      vendRoots.set(top, (vendRoots.get(top) || 0) + 1);
    }
  }
  console.log("\n  " + repo.toUpperCase() + "  CODE=" + byKind.CODE + "  DOC=" + byKind.DOC + "  VENDOR=" + byKind.VENDOR);
  const top = Array.from(vendRoots.entries()).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 4);
  for (const t of top) console.log("        vendored subtree " + t[0] + "  (" + t[1] + " files)");
}

console.log("");
console.log(EQ);
console.log("PART 2 - first-party CODE only (vendor + docs excluded)");
console.log(EQ);
for (const repo of TARGETS) {
  const dir = ROOT + "\\" + repo;
  if (!fs.existsSync(dir)) continue;
  const sha = cp.execSync('git -C "' + dir + '" rev-parse HEAD', { encoding: "utf8" }).trim();
  const rels = []; walk(dir, rels, "");
  const code = rels.filter(function (f) { return classify(f.r) === "CODE"; });
  const cache = code.map(function (f) {
    try { return { r: f.r, t: fs.readFileSync(f.p, "utf8") }; } catch { return null; }
  }).filter(Boolean);

  function countAll(t, re) { re.lastIndex = 0; let n = 0; while (re.exec(t) !== null) { n++; if (re.lastIndex === 0) break; } return n; }

  console.log("\n  -- " + repo.toUpperCase() + "  commit=" + sha.slice(0, 12) + "  first-party files=" + code.length);
  for (const [name, re] of PRIMS) {
    let n = 0; const hit = new Map();
    for (const c of cache) {
      const k = countAll(c.t, re);
      if (k) { n += k; hit.set(c.r, (hit.get(c.r) || 0) + k); }
    }
    if (n === 0) { console.log("       " + name.padEnd(14) + " 0   (absent from first-party code)"); continue; }
    const top = Array.from(hit.entries()).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 3);
    console.log("       " + name.padEnd(14) + " " + String(n).padStart(5) + "  " + top.map(function (t) { return t[0] + "(" + t[1] + ")"; }).join("  "));
  }
}
console.log("");
console.log("DONE");