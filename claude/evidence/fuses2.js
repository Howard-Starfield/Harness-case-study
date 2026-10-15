"use strict";
// CORRECTED fuse reader. The prior tool (fuses.js) reported 0x30 as UNKNOWN.
// Electron FuseV1 wire encoding is ASCII: '0'=disabled, '1'=enabled, 'r'=removed.
// Rebuild from the spec and re-read. Also list the FULL named fuse set for
// Electron 44 (the prior list had 7 names for a length-9 payload).
const fs = require("fs");

const file = process.argv[2];
const SENTINEL = Buffer.from("dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX", "ascii");

// Electron FuseV1Options in declaration order (electron/fuses), index = wire byte index.
const NAMES = [
  "RunAsNode",
  "EnableCookieEncryption",
  "EnableNodeOptionsEnvironmentVariable",
  "EnableNodeCliInspectArguments",
  "EnableEmbeddedAsarIntegrityValidation",
  "OnlyLoadAppFromAsar",
  "LoadBrowserProcessSpecificV8Snapshot",
  "GrantFileProtocolExtraPrivileges",
  "EnableFuses" /* placeholder for trailing fuse added post-44; labelled UNKNOWN if unnamed */,
];

const fd = fs.openSync(file, "r");
const size = fs.fstatSync(fd).size;
const CHUNK = 1 << 22;
const buf = Buffer.alloc(CHUNK + SENTINEL.length);
let found = -1, carry = 0;
for (let off = 0; off < size && found < 0; off += CHUNK) {
  const n = fs.readSync(fd, buf, carry, Math.min(CHUNK, size - off), off);
  const total = carry + n;
  const idx = buf.slice(0, total).indexOf(SENTINEL);
  if (idx >= 0) { found = off - carry + idx; break; }
  carry = Math.min(SENTINEL.length, total);
  buf.copy(buf, 0, total - carry, total);
}
if (found < 0) { console.log("sentinel NOT FOUND -> no Electron fuse block"); process.exit(0); }

const after = Buffer.alloc(64);
fs.readSync(fd, after, 0, 64, found + SENTINEL.length);
fs.closeSync(fd);

const version = after[0], length = after[1];
console.log(`file        : ${file}`);
console.log(`size        : ${size} bytes`);
console.log(`sentinel    : file offset 0x${found.toString(16)} (${found})`);
console.log(`fuseVersion : ${version}`);
console.log(`fuseLength  : ${length}`);
console.log(`\ndecoding rule: '0'(0x30)=DISABLED  '1'(0x31)=ENABLED  'r'(0x72)=REMOVED\n`);
for (let i = 0; i < length; i++) {
  const b = after[2 + i];
  const st = b === 0x30 ? "DISABLED" : b === 0x31 ? "ENABLED" : b === 0x72 ? "REMOVED" : `UNKNOWN(0x${b.toString(16)})`;
  const nm = NAMES[i] || `(unnamed fuse #${i})`;
  console.log(`  ${String(i).padStart(2)}. ${nm.padEnd(42)} ${st}`);
}
console.log(`\nraw wire  : ${after.slice(0, 2 + length).toString("hex")}`);
console.log(`fuse bytes: ${after.slice(2, 2 + length).toString("latin1")}`);
