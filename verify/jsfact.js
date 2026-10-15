const fs = require('fs');
const SRC = process.argv[2];
const t = fs.readFileSync(SRC, 'utf8');

console.log('=== FACT-CHECK 2: the Set members, in true JS semantics ===');
const m = t.match(/Bf\s*=\s*new Set\(\s*\[([^\]]*)\]/);
const vals = m[1].split(',').map(s => s.trim()).filter(Boolean);
console.log('  raw source: Bf=new Set([' + vals.join(',') + '])');
const asJS = vals.map(v => eval(v));
asJS.forEach((v, i) => {
  console.log(`   [${i}] source ${vals[i].padEnd(14)} -> JS number ${v}  (int32: ${v | 0} = 0x${((v | 0) >>> 0).toString(16).toUpperCase()})`);
});
const s = new Set(asJS);
console.log(`   Set.size as constructed = ${s.size}  <-- ${s.size === 2 ? 'TWO distinct members; my "1 distinct value" was an int32 artifact' : 'one member'}`);
console.log(`   Bf.has(-1073741515) = ${s.has(-1073741515)}`);
console.log(`   Bf.has(3221225781)  = ${s.has(3221225781)}   <-- Electron exitCode is signed, so the positive literal is dead`);
console.log(`   SameValueZero dedupe of the two spellings: ${s.has(asJS[0]) && s.has(asJS[1]) ? 'both live' : 'only one live'}`);

console.log('\n=== FACT-CHECK 3: Sentry gauge - which memory metric, what interval? ===');
for (const mm of t.matchAll(/metrics\]\[?'?gauge'?\]?\s*\)?\s*\(\s*'([^']+)'/g)) {
  const i = mm.index; const s0 = Math.max(0, i - 80);
  console.log(`   metric = '${mm[1]}'`);
  console.log('   ' + t.slice(s0, i + 260).replace(/\s+/g, ' '));
}
console.log('   memoryUsage keys referenced:');
for (const mm of t.matchAll(/memoryUsage\(\)\['(\w+)'\]/g)) console.log(`     '${mm[1]}'`);
console.log('   0x7530 =', 0x7530, 'ms');
console.log('   0x5dc  =', 0x5dc, 'ms (relaunch grace)');

console.log('\n=== FACT-CHECK 4: Mixpanel At() gating ===');
const at = t.indexOf('mixpanel_electronMainProcessSendMixPanelEvent');
console.log(`   context log at ${at}`);
if (at > 0) { const s0 = Math.max(0, at - 900); console.log('   ' + t.slice(s0, at + 160).replace(/\s+/g, ' ')); }