"use strict";
// Read Electron FuseV1 wire data from an Electron binary.
// Sentinel: dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX
// Layout after sentinel: [version u8][length u8][fuse bytes...]
// Fuse byte 0x72 ('r') = removed/disabled, 0x31 ('1') = enabled.
const fs = require("fs");
const file = process.argv[2];
const SENTINEL = Buffer.from("dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX", "ascii");
const NAMES = [
  "RunAsNode",
  "EnableCookieEncryption",
  "EnableNodeOptionsEnvironmentVariable",
  "EnableNodeCliInspectArguments",
  "EnableEmbeddedAsarIntegrityValidation",
  "OnlyLoadAppFromAsar",
  "LoadBrowserProcessSpecificV8Snapshot",
];

const fd = fs.openSync(file, "r");
const stat = fs.fstatSync(fd);
const CHUNK = 1 << 22;
const buf = Buffer.alloc(CHUNK + SENTINEL.length);
let found = -1;
let carry = 0;
for (let off = 0; off < stat.size && found < 0; off += CHUNK) {
  const n = fs.readSync(fd, buf, carry, Math.min(CHUNK, stat.size - off), off);
  const total = carry + n;
  const idx = buf.slice(0, total).indexOf(SENTINEL);
  if (idx >= 0) {
    found = off - carry + idx;
    break;
  }
  carry = Math.min(SENTINEL.length, total);
  buf.copy(buf, 0, total - carry, total);
}
fs.closeSync(fd);

console.log(`file        : ${file}`);
console.log(`size        : ${stat.size} bytes`);
if (found < 0) {
  console.log("sentinel    : NOT FOUND  ->  Electron fuses were NOT applied at build time");
  process.exit(0);
}
console.log(`sentinel    : found at file offset 0x${found.toString(16)} (${found})`);

const fd2 = fs.openSync(file, "r");
const after = Buffer.alloc(32);
fs.readSync(fd2, after, 0, 32, found + SENTINEL.length);
fs.closeSync(fd2);

const version = after[0];
const length = after[1];
console.log(`fuseVersion : ${version}`);
console.log(`fuseLength  : ${length}`);
console.log("\nFuseV1Options:");
for (let i = 0; i < Math.min(length, NAMES.length); i++) {
  const b = after[2 + i];
  const state = b === 0x72 ? "REMOVED (disabled)" : b === 0x31 ? "ENABLED" : `UNKNOWN(0x${b.toString(16)})`;
  console.log(`  ${String(i).padStart(2)}. ${NAMES[i].padEnd(42)} ${state}`);
}
if (length > NAMES.length) console.log(`  (${length - NAMES.length} further fuse bytes not named)`);
console.log(`\nraw wire    : ${after.slice(0, 2 + length).toString("hex")}`);
console.log(`ascii       : ${after.slice(0, 2 + length).toString("latin1").replace(/[^\x20-\x7e]/g, ".")}`);