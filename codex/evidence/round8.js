"use strict";
// Round 8: decode the Electron fuse wire from chrome.dll (where calibration found it).
const fs = require("fs");
const path = require("path");
const P = "C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.1007.2314.0_x64__2p2nqsd0c76g0\\app\\chrome.dll";
const EQ = "=".repeat(74);
function hdr(t) { console.log("\n" + EQ + "\n== " + t + "\n" + EQ); }

const SENTINEL = Buffer.from("dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX", "ascii");
const FUSE_NAMES = [
  "RunAsNode",
  "EnableCookieEncryption",
  "EnableNodeOptionsEnvironmentVariable",
  "EnableNodeCliInspectArguments",
  "EnableEmbeddedAsarIntegrityValidation",
  "OnlyLoadAppFromAsar",
  "LoadBrowserProcessSpecificV8Snapshot",
  "GrantFileProtocolExtraPrivileges",
];

const b = fs.readFileSync(P);
hdr("ELECTRON FUSE WIRE - chrome.dll");
const sent = b.indexOf(SENTINEL);
const second = b.indexOf(SENTINEL, sent + 1);
console.log("  sentinel occurrences : " + (second < 0 ? 1 : 2) + "   first at 0x" + sent.toString(16));
if (second >= 0) console.log("  second occurrence    : 0x" + second.toString(16));

for (const at of (second < 0 ? [sent] : [sent, second])) {
  const lenOff = at - 4, verOff = at - 8;
  const version = b.readUInt32LE(verOff);
  const length = b.readUInt32LE(lenOff);
  const start = lenOff - length;
  console.log("\n  --- candidate at 0x" + at.toString(16) + " ---");
  console.log("  preceding uint32 (wire version?) : " + version);
  console.log("  preceding uint32 (wire length?)  : " + length);
  if (version !== 1 || start < 0 || length > 64) {
    console.log("  -> does not look like a fuse wire; skipping");
    continue;
  }
  console.log("  fuse bytes start at 0x" + start.toString(16));
  const vals = [];
  for (let i = 0; i < length; i++) vals.push(b[start + i]);
  console.log("  " + "-".repeat(64));
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    const name = FUSE_NAMES[i] || ("fuse[" + i + "] name not in @electron/fuses v1 index");
    const state = v === 0 ? "DISABLED" : v === 1 ? "ENABLED" : "r=" + v + " UNRECOGNISED";
    console.log("  [" + String(i).padStart(2) + "] " + name.padEnd(44) + state);
  }
  console.log("  " + "-".repeat(64));
  console.log("  raw bytes: " + vals.map((v) => "0x" + v.toString(16).padStart(2, "0")).join(" "));
}