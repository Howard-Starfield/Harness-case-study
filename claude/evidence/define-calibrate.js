"use strict";
// Calibrate the negative: does V8 in claude.exe store unresolved-global
// identifier names as contiguous ASCII in the binary?
// Control needles = identifiers we KNOW are referenced as bare globals in
// app code (so, if V8 stringifies them, they should appear).
const fs = require("fs");
const p = process.argv[2];

const NEEDLES = [
  "__ELECTRON_WINDOW_ALLOWED_ORIGINS__",  // target
  "isDeveloperApprovedDevUrlOverrideEnabled", // app global, set via globalThis.x=...
  "__dirname",                              // Node global
  "__filename",                             // Node global
  "ELECTRON_RUN_AS_NODE",                   // env var name
  "ELECTRON_NO_ATTACH_CONSOLE",             // env var name
  "app://localhost",                        // literal that SHOULD be present
  "cowork-vm-service",                      // literal that SHOULD be present
];

const fd = fs.openSync(p, "r");
const size = fs.fstatSync(fd).size;
const CH = 1 << 22;
const maxLen = Math.max(...NEEDLES.map((n) => Buffer.byteLength(n)));
const counts = new Map(NEEDLES.map((n) => [n, 0]));
const firstOff = new Map();
const buf = Buffer.alloc(CH + maxLen);
let carry = 0, off = 0;

while (off < size) {
  const n = fs.readSync(fd, buf, carry, Math.min(CH, size - off), off);
  const total = carry + n;
  for (const needle of NEEDLES) {
    const nb = Buffer.from(needle, "latin1");
    let i = -1;
    while ((i = buf.indexOf(nb, i + 1)) >= 0 && i < total) {
      counts.set(needle, counts.get(needle) + 1);
      if (!firstOff.has(needle)) firstOff.set(needle, off - carry + i);
    }
  }
  carry = Math.min(maxLen - 1, total);
  buf.copy(buf, 0, total - carry, total);
  off += CH;
}
fs.closeSync(fd);

console.log(`file: ${p}  (${size} bytes)\n`);
console.log("needle                                          count   first offset");
for (const n of NEEDLES) {
  const c = counts.get(n);
  const o = firstOff.has(n) ? "0x" + firstOff.get(n).toString(16) : "-";
  console.log(`${n.padEnd(48)} ${String(c).padStart(5)}   ${o}`);
}
console.log(`\nINTERPRETATION:`);
console.log(`  If control needles like __dirname / app://localhost are FOUND but`);
console.log(`  __ELECTRON_WINDOW_ALLOWED_ORIGINS__ is ABSENT, the scan method is`);
console.log(`  demonstrably able to detect such identifiers, so the absence is`);
console.log(`  meaningful evidence rather than a scan artifact.`);
