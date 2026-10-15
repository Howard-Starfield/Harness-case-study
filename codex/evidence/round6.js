"use strict";
// Round 6: Electron fuses from the REAL Electron binary (ChatGPT.exe, not the 20KB
// Codex.exe launcher stub) + inventory of the out-of-ASAR native/ directory.
const fs = require("fs");
const path = require("path");
const ROOT = "C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.1007.2314.0_x64__2p2nqsd0c76g0";
const HERE = __dirname;
const EQ = "=".repeat(74);

function hdr(t) { console.log("\n" + EQ + "\n== " + t + "\n" + EQ); }

// ---------- Electron fuse wire ----------
// Sentinel string marks the end of the fuse wire; the wire immediately precedes it:
//   uint32 version(=1) | uint32 length | <length bytes of fuse values>
const SENTINEL = Buffer.from("dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX", "ascii");

// @electron/fuses enum order (v1 wire order)
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

function readFuses(file) {
  const b = fs.readFileSync(file);
  const sent = b.indexOf(SENTINEL);
  if (sent < 0) return { error: "fuse sentinel not found in " + path.basename(file) };
  // version(4) + length(4) sit immediately before the sentinel
  const lenOff = sent - 4;
  const verOff = sent - 8;
  const version = b.readUInt32LE(verOff);
  const length = b.readUInt32LE(lenOff);
  const start = lenOff - length;
  if (version !== 1 || start < 0) {
    return { error: "unexpected fuse wire (version=" + version + ", length=" + length + ")" };
  }
  const values = [];
  for (let i = 0; i < length; i++) values.push(b[start + i]);
  return { offset: "0x" + start.toString(16), sentinelOffset: "0x" + sent.toString(16), version, length, values };
}

for (const rel of ["app\\ChatGPT.exe", "app\\Codex.exe"]) {
  const p = path.join(ROOT, rel);
  hdr("ELECTRON FUSES — " + rel);
  if (!fs.existsSync(p)) { console.log("  (absent)"); continue; }
  const r = readFuses(p);
  if (r.error) { console.log("  " + r.error + "  (size=" + fs.statSync(p).size + " B)"); continue; }
  console.log("  fuse wire offset : " + r.offset + "   sentinel at " + r.sentinelOffset);
  console.log("  wire version     : " + r.version + "   length: " + r.length);
  console.log("  " + "-".repeat(60));
  for (let i = 0; i < r.values.length; i++) {
    const v = r.values[i];
    const name = FUSE_NAMES[i] || ("fuse[" + i + "] (name unknown for this index)");
    const state = v === 0 ? "DISABLED" : v === 1 ? "ENABLED " : "r=" + v + " (UNRECOGNISED)";
    console.log("  [" + String(i).padStart(2) + "] " + name.padEnd(42) + state);
  }
}

// ---------- out-of-ASAR native/ directory ----------
hdr("OUT-OF-ASAR RESOURCES (integrity-check boundary)");
const res = path.join(ROOT, "app", "resources");
let total = 0, files = 0;
(function walk(d, depth) {
  let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, depth + 1);
    else {
      const st = fs.statSync(p); total += st.size; files++;
      if (e.name.match(/\.(node|dll|exe)$/i) || depth === 0) {
        console.log("  " + path.relative(res, p).replace(/\\/g, "/").padEnd(66) + String(st.size).padStart(12));
      }
    }
  }
})(res, 0);
console.log("  ---");
console.log("  files outside app.asar: " + files + "   bytes: " + total.toLocaleString());