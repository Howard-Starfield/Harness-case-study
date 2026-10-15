"use strict";
// What ARE the extensionless "UnknownError" files? Don't assume - read magic bytes.
const fs = require("fs");
const path = require("path");
const ROOT = "C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.1007.2314.0_x64__2p2nqsd0c76g0\\app\\resources";

const files = ["codex", "codex-code-mode-host", "rg", "codex.exe", "codex-command-runner.exe"];
const MAGIC = {
  "7f454c46": "ELF (Linux/Unix executable)",
  "4d5a": "PE/MZ (Windows executable)",
  "504b0304": "ZIP archive",
  "cafebabe": "Java class / fat Mach-O",
  "feedface": "Mach-O 32",
  "feedfacf": "Mach-O 64",
};

for (const f of files) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) { console.log(`${f}: MISSING`); continue; }
  const fd = fs.openSync(p, "r");
  const buf = Buffer.alloc(64);
  fs.readSync(fd, buf, 0, 64, 0);
  fs.closeSync(fd);
  const size = fs.statSync(p).size;
  const magic = buf.subarray(0, 4).toString("hex");
  let kind = MAGIC[magic] || `unknown (0x${magic})`;
  let extra = "";
  if (magic === "7f454c46") {
    const cls = buf[4]; // 1=32bit 2=64bit
    const data = buf[5]; // 1=LE 2=BE
    const osabi = buf[7];
    const type = buf.readUInt16LE(16);
    const machine = buf.readUInt16LE(18);
    const TYPES = { 1: "ET_REL", 2: "ET_EXEC", 3: "ET_DYN (PIE/shared)" };
    const MACH = { 0x3e: "x86-64", 0xb7: "AArch64", 0x03: "x86", 0x28: "ARM" };
    extra = `\n    ELF ${cls === 2 ? "64-bit" : "32-bit"} ${data === 1 ? "little" : "big"}-endian` +
      `\n    type   : ${TYPES[type] || type}` +
      `\n    machine: ${MACH[machine] || "0x" + machine.toString(16)}` +
      `\n    osabi  : ${osabi} (${osabi === 0 ? "SYSV/Linux" : osabi === 3 ? "Linux" : osabi})`;
  }
  console.log(`${f.padEnd(26)} ${size.toLocaleString().padStart(14)} B  ${kind}${extra}`);
}