// Region deobfuscator: prints a byte range of the bundle with decoder calls
// replaced by their literal values, using the decoder rebuilt in decoder.js logic.
const fs = require('fs');
const vm = require('vm');

const SRC = process.argv[2];
const src = fs.readFileSync(SRC, 'utf8');

function balancedFn(startIdx) {
  let i = src.indexOf('{', startIdx), depth = 0, instr = null, esc = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (instr) { if (c === instr) instr = null; continue; }
    if (c === '"' || c === "'" || c === '`') { instr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(startIdx, j + 1); }
  }
  return null;
}

const arrFnName = src.match(/\}\s*\(\s*(_0x[0-9a-f]+)\s*,\s*0x[0-9a-f]+\s*\)\s*\)?\s*;/)[1];
const decFnName = src.match(/const\s+_0x[0-9a-f]+\s*=\s*(_0x[0-9a-f]+)\s*;/)[1];
const arrFn = balancedFn(src.indexOf('function ' + arrFnName));
const decFn = balancedFn(src.indexOf('function ' + decFnName));

const iifeRe = /\(function\s*\(\s*_0x[0-9a-f]+\s*,\s*_0x[0-9a-f]+\s*\)\s*\{/;
const iifeStart = src.search(iifeRe);
let iife = null;
{
  let i = src.indexOf('{', iifeStart), depth = 0, instr = null, esc = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (instr) { if (c === instr) instr = null; continue; }
    if (c === '"' || c === "'" || c === '`') { instr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { let k = j + 1; while (k < src.length && src[k] !== ';') k++; iife = src.slice(iifeStart, k + 1); break; } }
  }
}
const ctx = vm.createContext({});
vm.runInContext([arrFn, decFn, iife].filter(Boolean).join('\n'), ctx, { timeout: 5000 });
const dec = vm.runInContext(decFnName, ctx);

const start = parseInt(process.argv[3], 10);
const len = parseInt(process.argv[4], 10);
let region = src.slice(start, start + len);

// replace ALIAS(0xHEX) and DEC(0xHEX) with "literal"
const aliasNames = [...new Set((src.match(/_0x[0-9a-f]+\s*=\s*_0x2c3b/g) || []).map(s => s.split('=')[0].trim()))];
const all = [...new Set([decFnName, ...aliasNames])];
const rx = new RegExp('(?:' + all.map(a => a.replace('$', '\\$')).join('|') + ')\\(\\s*(0x[0-9a-f]+)\\s*\\)', 'g');
region = region.replace(rx, (m, hex) => {
  try { return JSON.stringify(dec(parseInt(hex, 16))); } catch { return m; }
});

// pretty-ish
region = region.replace(/;/g, ';\n').replace(/\},/g, '},\n');
console.log(region);