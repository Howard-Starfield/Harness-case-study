"use strict";
// PE inventory: export tables + section headers for the vendor-shipped
// Windows binaries. Static file parsing only — nothing is loaded or executed.
// Also re-derives Electron fuses with the CORRECT wire encoding:
//   '0' (0x30) = DISABLED, '1' (0x31) = ENABLED, 'r' (0x72) = REMOVED
const fs = require("fs");
const path = require("path");

const ROOT = "C:\\Program Files\\WindowsApps\\Claude_2.31226.1.0_x64__pzs8sxrjxfjjc\\app";

function rvaToOff(secs, rva) {
  for (const s of secs) {
    if (rva >= s.va && rva < s.va + Math.max(s.vsz, s.rawsz)) return rva - s.va + s.raw;
  }
  return null;
}

function parsePE(file) {
  const fd = fs.openSync(file, "r");
  const st = fs.fstatSync(fd);
  const buf = Buffer.alloc(Math.min(st.size, 64 * 1024 * 1024));
  fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);

  if (buf.readUInt16LE(0) !== 0x5a4d) return { error: "not a PE (no MZ)" };
  const peOff = buf.readUInt32LE(0x3c);
  if (buf.readUInt32LE(peOff) !== 0x00004550) return { error: "bad PE signature" };
  const coff = peOff + 4;
  const machine = buf.readUInt16LE(coff);
  const numSec = buf.readUInt16LE(coff + 2);
  const optSize = buf.readUInt16LE(coff + 16);
  const opt = coff + 20;
  const magic = buf.readUInt16LE(opt);
  const pe32plus = magic === 0x20b;
  const imageBase = pe32plus ? buf.readBigUInt64LE(opt + 24) : BigInt(buf.readUInt32LE(opt + 28));

  // data directories
  const ddOff = opt + (pe32plus ? 112 : 96);
  const numDD = buf.readUInt32LE(opt + (pe32plus ? 108 : 92));
  const dd = (i) => ({ rva: buf.readUInt32LE(ddOff + i * 8), size: buf.readUInt32LE(ddOff + i * 8 + 4) });

  // sections
  const secOff = opt + optSize;
  const secs = [];
  for (let i = 0; i < numSec; i++) {
    const o = secOff + i * 40;
    secs.push({
      name: buf.toString("latin1", o, o + 8).replace(/\0+$/, ""),
      vsz: buf.readUInt32LE(o + 8),
      va: buf.readUInt32LE(o + 12),
      rawsz: buf.readUInt32LE(o + 16),
      raw: buf.readUInt32LE(o + 20),
      chars: buf.readUInt32LE(o + 36),
    });
  }

  // export directory (index 0)
  const exp = dd(0);
  let exports = [];
  let expInfo = null;
  if (exp.rva) {
    const eo = rvaToOff(secs, exp.rva);
    if (eo !== null) {
      const nNames = buf.readUInt32LE(eo + 24);
      const namesRva = buf.readUInt32LE(eo + 32);
      const no = rvaToOff(secs, namesRva);
      if (no !== null) {
        for (let i = 0; i < nNames && i < 4000; i++) {
          const nr = buf.readUInt32LE(no + i * 4);
          const so = rvaToOff(secs, nr);
          if (so === null) continue;
          let end = so;
          while (end < buf.length && buf[end] !== 0) end++;
          exports.push(buf.toString("latin1", so, end));
        }
      }
      expInfo = { nameRva: exp.rva, numNames: nNames, fileOffsetOfDir: eo };
    }
  }

  return {
    machine: machine === 0x8664 ? "x86-64" : machine === 0x14c ? "x86" : "0x" + machine.toString(16),
    sections: secs.map((s) => ({ name: s.name, vaddr: s.va, vsize: s.vsz, fileOff: s.raw, rawSize: s.rawsz, chars: s.chars })),
    imageBase: imageBase.toString(),
    exportDirFileOffset: expInfo,
    exports,
  };
}

const TARGETS = [
  "resources\\cowork-svc.exe",
  "resources\\claude-ssh-broker.exe",
  "resources\\claude-ssh-proxy.exe",
  "resources\\claude-ssh-askpass.exe",
  "resources\\chrome-native-host.exe",
];

const out = [];
out.push("=== PE INVENTORY (static file parse; nothing loaded or executed) ===");
for (const rel of TARGETS) {
  const p = path.join(ROOT, rel);
  out.push(`\n########## ${rel}  (${fs.statSync(p).size} bytes) ##########`);
  const r = parsePE(p);
  if (r.error) { out.push("  ERROR: " + r.error); continue; }
  out.push(`  machine=${r.machine}  imageBase=0x${r.imageBase}`);
  out.push(`  sections:`);
  for (const s of r.sections)
    out.push(`    ${s.name.padEnd(10)} VA=0x${s.vaddr.toString(16).padStart(8,"0")} VSize=${String(s.vsize).padStart(10)} FileOff=${String(s.fileOff).padStart(10)} RawSize=${String(s.rawSize).padStart(10)} chars=0x${s.chars.toString(16)}`);
  out.push(`  RVA->file-offset rule: file_offset = RVA - section.VA + section.FileOffset (verified against export dir)`);
  if (r.exportDirFileOffset) {
    out.push(`  export directory RVA=0x${r.exportDirFileOffset.nameRva.toString(16)} -> file offset ${r.exportDirFileOffset.fileOffsetOfDir}`);
    out.push(`  exported names: ${r.exports.length}`);
    for (const e of r.exports.slice(0, 60)) out.push(`    ${e}`);
    if (r.exports.length > 60) out.push(`    ... (+${r.exports.length - 60} more)`);
  } else out.push("  NO EXPORT DIRECTORY");
}

fs.writeFileSync(path.join(__dirname, "pe-inventory.txt"), out.join("\n"));
console.log(out.join("\n"));
