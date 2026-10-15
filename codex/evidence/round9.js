"use strict";
// Round 9: hunt for a VALID Electron fuse wire anywhere in the package.
// A bare sentinel string is not proof of a wire; validate version+length before claiming.
const fs = require("fs");
const path = require("path");
const ROOT = "C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.1007.2314.0_x64__2p2nqsd0c76g0";
const EQ = "=".repeat(74);
function hdr(t) { console.log("\n" + EQ + "\n== " + t + "\n" + EQ); }

const SENTINEL = Buffer.from("dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX", "ascii");

// Candidate binaries: everything small enough to scan fully, plus the big ones explicitly.
const cands = [];
function collect(d, depth) {
  if (depth > 3) return;
  let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { collect(p, depth + 1); continue; }
    if (!/\.(exe|dll|node)$/i.test(e.name)) continue;
    const sz = fs.statSync(p).size;
    if (sz > 420 * 1024 * 1024) continue;
    cands.push(p);
  }
}
collect(path.join(ROOT, "app"), 0);

hdr("SCANNING " + cands.length + " PE/.node candidates for the fuse sentinel");
let sentinelHits = 0, validWires = 0;
for (const p of cands) {
  let b; try { b = fs.readFileSync(p); } catch { continue; }
  let idx = b.indexOf(SENTINEL);
  while (idx >= 0) {
    sentinelHits++;
    const verOff = idx - 8, lenOff = idx - 4;
    const ok = verOff >= 0 && lenOff >= 0;
    const version = ok ? b.readUInt32LE(verOff) : null;
    const length = ok ? b.readUInt32LE(lenOff) : null;
    const isWire = ok && version === 1 && length >= 1 && length <= 32 && lenOff - length >= 0;
    console.log("\n  " + path.relative(ROOT, p).replace(/\\/g, "/"));
    console.log("      sentinel @ 0x" + idx.toString(16));
    console.log("      u32@ -8 = " + version + "   u32@ -4 = " + length + "   -> " + (isWire ? "VALID WIRE" : "NOT a wire"));
    if (isWire) {
      validWires++;
      const start = lenOff - length;
      const vals = [];
      for (let i = 0; i < length; i++) vals.push(b[start + i]);
      console.log("      fuse bytes @ 0x" + start.toString(16) + " : " + vals.map((v) => "0x" + v.toString(16)).join(" "));
    } else {
      const s = Math.max(0, idx - 40), e = Math.min(b.length, idx + 36);
      const dump = b.subarray(s, e).toString("hex").replace(/(.{2})/g, "$1 ").replace(/((?:\S\S ){16})/g, "$1\n            ");
      console.log("      context:\n            " + dump);
      const txt = b.subarray(s, e).toString("latin1").replace(/[^\x20-\x7e]/g, ".");
      console.log("      ascii   : " + txt);
    }
    idx = b.indexOf(SENTINEL, idx + 1);
  }
}
console.log("\n  TOTAL sentinel occurrences: " + sentinelHits);
console.log("  TOTAL valid fuse wires    : " + validWires);