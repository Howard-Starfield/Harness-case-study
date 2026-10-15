// Independent decoder rebuild — does NOT use the prior study's strings-main.txt.
// Extracts only the string-array function, the rotator, and the decoder from the
// bundle and evaluates those three in a fresh vm context. No vendor logic runs.
const fs = require('fs');
const vm = require('vm');

const SRC = process.argv[2];
const src = fs.readFileSync(SRC, 'utf8');

function balancedFn(startIdx) {
  // startIdx points at "function"
  let i = src.indexOf('{', startIdx);
  let depth = 0, instr = null, esc = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (instr) {
      if (c === instr) instr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { instr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(startIdx, j + 1); }
  }
  return null;
}

// Derive names from the rotator IIFE itself: (function(a,b){...}(ARRAYFN, 0xNNNN))
const iifeHead = src.match(/\(function\s*\(\s*(_0x[0-9a-f]+)\s*,\s*(_0x[0-9a-f]+)\s*\)\s*\{/);
const arrFnName = src.match(/\}\s*\(\s*(_0x[0-9a-f]+)\s*,\s*0x[0-9a-f]+\s*\)\s*\)?\s*;/)[1];
const decFnName = src.match(new RegExp('const\\s+' + '_0x[0-9a-f]+' + '\\s*=\\s*(_0x[0-9a-f]+)\\s*;'))[1];
console.error(`[decoder] names -> array=${arrFnName} decoder=${decFnName}`);

// 1. the string-array function
const arrFnIdx = src.indexOf('function ' + arrFnName);
if (arrFnIdx < 0) throw new Error('array fn not found: ' + arrFnName);
const arrFn = balancedFn(arrFnIdx);
console.error(`[decoder] array fn: ${arrFnName} (${arrFn.length} chars)`);

// 2. the decoder function
const decFnIdx = src.indexOf('function ' + decFnName);
if (decFnIdx < 0) throw new Error('decoder fn not found: ' + decFnName);
const decFn = balancedFn(decFnIdx);
console.error(`[decoder] decoder fn: ${decFnName} (${decFn.length} chars)`);

// 3. the rotator IIFE — (function(a,b){...}(ARRFN, 0xNNNN))
const iifeRe = new RegExp('\\(function\\s*\\(\\s*_0x[0-9a-f]+\\s*,\\s*_0x[0-9a-f]+\\s*\\)\\s*\\{');
const iifeStart = src.search(iifeRe);
let iife = null;
if (iifeStart >= 0) {
  let i = src.indexOf('{', iifeStart), depth = 0, instr = null, esc = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (instr) { if (c === instr) instr = null; continue; }
    if (c === '"' || c === "'" || c === '`') { instr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        // consume the call args: }(ARRFN, 0xNNN))
        let k = j + 1;
        while (k < src.length && src[k] !== ';') k++;
        iife = src.slice(iifeStart, k + 1);
        break;
      }
    }
  }
}
console.error(`[decoder] rotator IIFE: ${iife ? iife.length + ' chars' : 'NOT FOUND'}`);

const code = [arrFn, decFn, iife].filter(Boolean).join('\n');
const ctx = vm.createContext({});
vm.runInContext(code, ctx, { timeout: 5000 });
const dec = vm.runInContext(decFnName, ctx);

const base = (src.match(new RegExp(decFnName.replace('$', '\\$') + '\\s*=\\s*function\\s*\\(\\s*_0x[0-9a-f]+\\s*,\\s*_0x[0-9a-f]+\\s*\\)\\s*\\{\\s*_0x[0-9a-f]+\\s*=\\s*_0x[0-9a-f]+\\s*-\\s*(0x[0-9a-f]+)')) || [])[1];
console.error(`[decoder] base offset: ${base}`);

// sanity validation against known use sites
const CHECKS = { '0xa2e': 'defineProperty', '0x50f': 'handle', '0x6d8': 'sender', '0x284': 'webPreferences', '0x1cf': 'getWindowOptions' };
console.error('[decoder] validation:');
for (const [k, expect] of Object.entries(CHECKS)) {
  const got = dec(parseInt(k, 16));
  console.error(`   ${k} -> ${JSON.stringify(got)}  ${got === expect ? 'OK' : '*** MISMATCH, expected ' + expect + ' ***'}`);
}

const targets = process.argv.slice(3);
for (const t of targets) {
  console.log(`0x${parseInt(t, 16).toString(16)}\t${JSON.stringify(dec(parseInt(t, 16)))}`);
}