"use strict";
// Read-only ASAR header parser. Lists entries; extracts on request.
// ASAR layout: [u32 pickleA][u32 headerPickleSize][u32 headerStrPickle][u32 headerStrSize][header JSON][pad][data]
const fs = require("fs");

const asarPath = process.argv[2];
const mode = process.argv[3] || "list"; // list | extract
const filter = process.argv[4] || "";
const outDir = process.argv[5] || "";

const buf = fs.readFileSync(asarPath);
const u32 = (o) => buf.readUInt32LE(o);

// Walk the leading pickles to find headerStrSize.
let p = 0;
while (p + 4 <= buf.length) {
  const v = u32(p);
  if (v === 4) { p += 4; continue; }
  const next = u32(p + 4);
  // headerPickleSize then headerStrPickle(=str+4) then str
  const headerStrSize = u32(p + 12);
  p = p + 8 + 4 + headerStrSize; // data begins here, padded
  break;
}
// Header JSON starts right after the first 4-byte "4" marker + 8 + 4 = offset 16
let jsonStart = buf.indexOf(0x7b, 16); // first '{'
if (jsonStart < 0) throw new Error("no JSON header found");
let depth = 0, end = -1, inStr = false, esc = false;
for (let i = jsonStart; i < buf.length; i++) {
  const c = buf[i];
  if (inStr) {
    if (esc) esc = false;
    else if (c === 0x5c) esc = true;
    else if (c === 0x22) inStr = false;
    continue;
  }
  if (c === 0x22) inStr = true;
  else if (c === 0x7b) depth++;
  else if (c === 0x7d) { depth--; if (depth === 0) { end = i; break; } }
}
const headerStr = buf.slice(jsonStart, end + 1).toString("utf8");
const header = JSON.parse(headerStr);
const baseOffset = (jsonStart + headerStrSizeUsed(jsonStart, buf, end)) & ~3;

function headerStrSizeUsed() {
  // data offset = aligned end of header JSON
  return end + 1;
}

const rows = [];
function walk(node, prefix) {
  for (const [name, meta] of Object.entries(node.files || {})) {
    const full = prefix ? prefix + "/" + name : name;
    if (meta.files) walk(meta, full);
    else
      rows.push({
        path: full,
        size: meta.size,
        unpacked: !!meta.unpacked,
        offset: meta.offset !== undefined ? Number(meta.offset) : null,
        executable: !!meta.executable,
        integrity: meta.integrity ? (meta.integrity.algorithm + ":" + String(meta.integrity.hash).slice(0, 16)) : "",
      });
  }
}
walk(header, "");

if (mode === "list") {
  const re = filter ? new RegExp(filter, "i") : null;
  let total = 0, n = 0, unpacked = 0;
  for (const r of rows) {
    if (re && !re.test(r.path)) continue;
    total += r.size; n++;
    if (r.unpacked) unpacked++;
    console.log(
      [String(r.size).padStart(11), r.path, r.unpacked ? "UNPACKED" : "", r.executable ? "EXEC" : "", r.integrity].join("\t")
    );
  }
  console.error(`\n${n} files matched, ${total} bytes, ${unpacked} unpacked (of ${rows.length} total entries)`);
} else {
  // extract filtered entries
  let n = 0;
  for (const r of rows) {
    if (filter && !new RegExp(filter, "i").test(r.path)) continue;
    if (r.unpacked || r.offset === null) continue;
    const start = baseOffset + r.offset;
    const data = buf.slice(start, start + r.size);
    const dest = require("path").join(outDir, r.path);
    require("fs").mkdirSync(require("path").dirname(dest), { recursive: true });
    require("fs").writeFileSync(dest, data);
    n++;
  }
  console.error(`extracted ${n} files to ${outDir} (baseOffset=${baseOffset})`);
}