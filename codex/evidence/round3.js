"use strict";
// Codex round 3: pin down the things that decide fail-open vs fail-closed.
const fs = require("fs");
const path = require("path");
const SRC = path.join(process.env.TEMP, "codex-src");
const B = path.join(SRC, ".vite", "build");

const read = (f) => fs.readFileSync(path.join(B, f), "utf8");
const files = fs.readdirSync(B).filter((f) => /\.(js|mjs)$/i.test(f));
const ALL = files.map((f) => ({ name: f, text: read(f) }));

function ctx(t, i, w = 300) {
  return t.slice(Math.max(0, i - w), Math.min(t.length, i + w)).replace(/\s+/g, " ");
}
function find(re, label, limit = 6, w = 420) {
  console.log(`\n${"-".repeat(74)}\n-- ${label}`);
  let n = 0;
  for (const { name, text } of ALL) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      n++; if (n > limit) break;
      console.log(`\n  [${name} @${m.index}] ${m[0]}`);
      console.log("    " + ctx(text, m.index, w));
    }
  }
  console.log(n === 0 ? "  (no hits)" : `  (${n} shown)`);
}

// --- 1. sandbox-setup timeout constants uo / lo / co ---
find(/\buo\s*=/g, "constant uo =", 4);
find(/\blo\s*=\s*\d/g, "constant lo =", 6);
find(/\bco\s*=\s*`/g, "constant co = (error msg)", 4);
find(/Cannot retry the same Windows sandbox setup/g, "timeout cooldown guard", 2, 700);
find(/startWindowsSandboxSetup\(/g, "startWindowsSandboxSetup definition + callers", 4, 800);

// --- 2. the request protocol surface (Codex's IPC analogue) ---
console.log(`\n${"=".repeat(74)}\n== REQUEST PROTOCOL METHODS (sendRequest targets)`);
console.log("=".repeat(74));
const methods = new Map();
for (const { name, text } of ALL) {
  const re = /sendRequest\(\s*`([^`]+)`/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (!methods.has(m[1])) methods.set(m[1], []);
    methods.get(m[1]).push(name);
  }
}
console.log(`distinct sendRequest() methods: ${methods.size}`);
for (const k of [...methods.keys()].sort()) {
  const isSandbox = /sandbox|elevat|exec|approv/i.test(k);
  console.log(`  ${isSandbox ? "***" : "   "} ${k.padEnd(46)} ${[...new Set(methods.get(k))].join(",").slice(0, 60)}`);
}

// --- 3. notification methods (inbound from server) ---
console.log(`\n${"=".repeat(74)}\n== INBOUND NOTIFICATION METHODS (handleNotification cases)`);
console.log("=".repeat(74));
const notif = new Map();
for (const { name, text } of ALL) {
  const re = /case\s*`([a-zA-Z]+[/.][a-zA-Z/_.-]+)`\s*:/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (!/[/]/.test(m[1])) continue;
    if (!notif.has(m[1])) notif.set(m[1], new Set());
    notif.get(m[1]).add(name);
  }
}
for (const k of [...notif.keys()].sort()) {
  const hot = /sandbox|elevat|exec|approv|policy/i.test(k);
  console.log(`  ${hot ? "***" : "   "} ${k}`);
}

// --- 4. elevation gate defaults ---
find(/allowServiceInstallElevation/g, "allowServiceInstallElevation", 8, 500);
find(/do-not-de-elevate/g, "do-not-de-elevate switch", 6, 500);

// --- 5. the two windows lacking an explicit sandbox key ---
find(/navigateOnDragDrop/g, "browser page window webPreferences", 2, 700);
find(/allowDevtools/g, "devtools gate", 5, 450);