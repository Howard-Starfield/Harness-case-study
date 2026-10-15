"use strict";
// Purpose-written ASAR reader. The REA JS analyzer failed on the 44 MB Claude
// asar (MCP timeouts, then a 90-minute CLI hang), so we parse the container
// ourselves. An asar is: UInt32LE header-size field at 0, UInt32LE header
// JSON-size, UInt32LE header-string-size, UInt32LE 0, then the JSON header,
// then file data at (base + header-size).
const fs = require("fs");
const path = require("path");

const asarPath = process.argv[2];
const outDir = process.argv[3];
const listOnly = process.argv.includes("--list");

const fd = fs.openSync(asarPath, "r");
const size = fs.fstatSync(fd).size;
const head = Buffer.alloc(16);
fs.readSync(fd, head, 0, 16, 0);

// Layout (validated byte-by-byte against the 44 MB Claude asar before reuse):
//   0  : u32   = 4                     (pickle header-size field)
//   4  : u32   = headerSize            (bytes from offset 8 to end of header block)
//   8  : u32   = headerSize - 4        (pickle payload length)
//   12 : u32   = jsonStringSize        (exact byte length of the JSON header)
//   16 : JSON header text, PADDED to 4-byte alignment
//   dataBase = 8 + headerSize
const headerPickle = head.readUInt32LE(0);
const headerSize = head.readUInt32LE(4);
const headerPayload = head.readUInt32LE(8);
const jsonSize = head.readUInt32LE(12);
const jsonStart = 16;

const jsonBuf = Buffer.alloc(jsonSize);
fs.readSync(fd, jsonBuf, 0, jsonSize, jsonStart);
const header = JSON.parse(jsonBuf.toString("utf8"));

const dataBase = 8 + headerSize;        // offset where file data begins
console.log(`asar        : ${asarPath}`);
console.log(`file size   : ${size} bytes`);
console.log(`headerSize  : ${headerSize} (payload ${headerPayload}, json ${jsonSize})`);
console.log(`dataBase    : ${dataBase}`);

const files = [];
function walk(node, prefix) {
  for (const [name, ent] of Object.entries(node.files || {})) {
    const p = prefix ? `${prefix}/${name}` : name;
    if (ent.files) walk(ent, p);
    else files.push({ path: p, offset: dataBase + Number(ent.offset || 0), size: ent.size, unpacked: !!ent.unpacked });
  }
}
walk(header, "");
let total = 0;
for (const f of files) total += f.size;
console.log(`entries     : ${files.length}`);
console.log(`sum sizes   : ${total} bytes`);
console.log(`unpacked    : ${files.filter((f) => f.unpacked).length}`);

fs.writeFileSync(path.join(__dirname, "asar-index.json"),
  JSON.stringify({ asar: asarPath, size, headerSize, jsonSize, dataBase, files }, null, 2));

if (listOnly) {
  const byExt = new Map();
  let biggest = [];
  for (const f of files) {
    const ext = path.extname(f.path).toLowerCase() || "(none)";
    const e = byExt.get(ext) || { n: 0, bytes: 0 };
    e.n++; e.bytes += f.size; byExt.set(ext, e);
  }
  console.log(`\n=== by extension ===`);
  for (const [ext, e] of [...byExt].sort((a, b) => b[1].bytes - a[1].bytes))
    console.log(`  ${ext.padEnd(12)} ${String(e.n).padStart(6)} files ${String(e.bytes).padStart(13)} bytes`);
  console.log(`\n=== 40 largest ===`);
  biggest = files.slice().sort((a, b) => b.size - a.size).slice(0, 40);
  for (const f of biggest) console.log(`  ${String(f.size).padStart(12)}  ${f.path}`);
  fs.closeSync(fd);
  process.exit(0);
}

// Extract
if (outDir) {
  let written = 0, bytes = 0;
  for (const f of files) {
    if (f.unpacked) continue;
    const dest = path.join(outDir, f.path);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const buf = Buffer.alloc(f.size);
    let got = 0;
    while (got < f.size) {
      const n = fs.readSync(fd, buf, got, f.size - got, f.offset + got);
      if (n <= 0) break;
      got += n;
    }
    fs.writeFileSync(dest, buf);
    written++; bytes += f.size;
  }
  console.log(`\nextracted   : ${written} files, ${bytes} bytes -> ${outDir}`);
}
fs.closeSync(fd);
