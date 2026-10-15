// Dump the FULL independently-decoded string table and answer specific questions.
const fs = require('fs');
const vm = require('vm');
const SRC = process.argv[2];
const src = fs.readFileSync(SRC, 'utf8');

function balancedFn(i0) {
  let i = src.indexOf('{', i0), depth = 0, instr = null, esc = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (instr) { if (c === instr) instr = null; continue; }
    if (c === '"' || c === "'" || c === '`') { instr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(i0, j + 1); }
  }
  return null;
}
const arrFnName = src.match(/\}\s*\(\s*(_0x[0-9a-f]+)\s*,\s*0x[0-9a-f]+\s*\)\s*\)?\s*;/)[1];
const decFnName = src.match(/const\s+_0x[0-9a-f]+\s*=\s*(_0x[0-9a-f]+)\s*;/)[1];
const arrFn = balancedFn(src.indexOf('function ' + arrFnName));
const decFn = balancedFn(src.indexOf('function ' + decFnName));
const iifeStart = src.search(/\(function\s*\(\s*_0x[0-9a-f]+\s*,\s*_0x[0-9a-f]+\s*\)\s*\{/);
let iife = null;
{ let i = src.indexOf('{', iifeStart), depth = 0, instr = null, esc = false;
  for (let j = i; j < src.length; j++) { const c = src[j];
    if (esc) { esc = false; continue; } if (c === '\\') { esc = true; continue; }
    if (instr) { if (c === instr) instr = null; continue; }
    if (c === '"' || c === "'" || c === '`') { instr = c; continue; }
    if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) { let k = j + 1; while (k < src.length && src[k] !== ';') k++; iife = src.slice(iifeStart, k + 1); break; } } } }
const ctx = vm.createContext({});
vm.runInContext([arrFn, decFn, iife].filter(Boolean).join('\n'), ctx, { timeout: 5000 });
const dec = vm.runInContext(decFnName, ctx);

const table = [];
for (let a = 0; a < 5000; a++) { try { const v = dec(0x1b5 + a); if (typeof v === 'string') table.push([0x1b5 + a, v]); } catch {} }
console.log(`[i] independently decoded ${table.length} strings (base 0x1b5)`);

const has = s => table.filter(([, v]) => v === s).map(([h]) => '0x' + h.toString(16));
const like = re => table.filter(([, v]) => re.test(v)).map(([, v]) => v);

console.log('\n=== Q: focused-context channels in MY decoded table ===');
const fc = like(/^focused-context:/).sort();
console.log(`   count = ${fc.length}`);
fc.forEach(v => console.log('   ' + v));

console.log('\n=== Q: do the 3 "phantom" names appear anywhere in MY table? ===');
for (const p of ['focused-context:get-focused-visible-text', 'focused-context:get-focused-visible-text-async', 'focused-context:get-focused-window-text'])
  console.log(`   ${p} -> ${has(p).length ? 'FOUND at ' + has(p) : 'ABSENT'}`);

console.log('\n=== Q: telemetry strings ===');
for (const p of ['mixpanel:track-event', '/app/metrics_mp', 'gpuSandboxDisabled', 'no-sandbox'])
  console.log(`   ${p} -> ${has(p).length ? 'FOUND at ' + has(p) : 'ABSENT'}`);

console.log('\n=== Q: every mixpanel-ish string in the table ===');
like(/mixpanel|metrics_mp|mixPanel/i).forEach(v => console.log('   ' + v));

console.log('\n=== Q: Bf Set + Uf constant, verbatim from source ===');
for (const re of [new RegExp('Bf\\s*=\\s*new Set\\(\\[[^\\]]*\\]\\)'), new RegExp('Uf\\s*=\\s*[^,;]{1,30}')]) {
  const m = src.match(re); console.log('   ' + (m ? m[0] : 'NOT MATCHED'));
}
const nums = src.match(/Bf\s*=\s*new Set\(\s*\[([^\]]*)\]/);
if (nums) {
  const vals = nums[1].split(',').map(s => s.trim()).filter(Boolean);
  console.log('   Bf members raw: ' + JSON.stringify(vals));
  const asInt = vals.map(v => {
    if (v.startsWith('0x') || v.startsWith('-0x')) return eval(v) | 0;
    if (v.startsWith('-')) return -parseInt(v.slice(1)) | 0;
    return parseInt(v) | 0;
  });
  asInt.forEach((v, idx) => console.log(`     [${idx}] ${vals[idx]}  -> int32 ${v}  -> hex 0x${(v >>> 0).toString(16).toUpperCase().padStart(8, '0')}`));
  console.log('   distinct values = ' + new Set(asInt).size);
}