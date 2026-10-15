"use strict";
// Decisive pass: is bash sandboxed, or only approved?
const fs = require("fs");
const SRC = process.env.TEMP + "\\claude-src";
const MAIN = SRC + "\\.vite\\build";
const EQ = "=".repeat(80);

const files = [];
(function walk(d) {
  let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = d + "\\" + e.name;
    if (e.isDirectory()) walk(p);
    else if (/\.(js|mjs|cjs)$/i.test(e.name)) files.push(p);
  }
})(SRC);
const main = files.filter(function (f) { return f.startsWith(MAIN); });

function countAll(t, re) { re.lastIndex = 0; let n = 0; while (re.exec(t) !== null) { n++; if (re.lastIndex === 0) break; } return n; }
function dump(title, list, re, win, cap) {
  let n = 0; console.log("\n" + EQ + "\n== " + title + "\n" + EQ);
  for (const f of list) {
    let t; try { t = fs.readFileSync(f, "utf8"); } catch { continue; }
    re.lastIndex = 0; let m, i = 0;
    while ((m = re.exec(t)) !== null && i < cap) {
      const s = Math.max(0, m.index - win);
      console.log("\n  [" + f.slice(SRC.length + 1).replace(/\\/g, "/") + " @" + m.index + "]\n  " + t.slice(s, m.index + win).replace(/\s+/g, " "));
      n++; i++; if (re.lastIndex === 0) break;
    }
  }
  if (!n) console.log("  (no hits)");
}

// 1. The sandbox settings object
dump("autoAllowBashIfSandboxed / sandbox settings", main, /autoAllowBashIfSandboxed|sandbox\s*[:=]\s*\{/gi, 340, 14);

// 2. toolGuard / read confinement
dump("toolGuard / fineReadsToCwd", main, /toolGuardSupported|fineReadsToCwd|toolGuard/gi, 300, 12);

// 3. What are the extension lists used for
dump("executable extension list SOn usage", main, /\bSOn\b/, 300, 8);

// 4. bash execution path
dump("Bash tool / shell execution", main, /localShell|shellCommand|bashTool|executeCommand|runBash/gi, 260, 12);

// 5. WSL as sandbox vs as CLI host
dump("WSL sandbox hints", main, /wslSandbox|sandboxWsl|wsl.*sandbox|sandbox.*wsl/gi, 260, 10);

// 6. network restriction inside sandbox
dump("network restriction", main, /networkAccess|allowedDomains|denyNetwork|network_requirements|allowedHosts/gi, 240, 10);

// 7. explicit sandbox enum
dump("sandbox mode enum", main, /sandboxMode|sandbox\s*===\s*[`"'][a-z]+[`"']|sandbox:\s*[`"'][a-z]+[`"']/gi, 240, 12);

console.log("");
console.log(EQ);
console.log("== SUMMARY COUNTS (MAIN corpus, " + main.length + " files)");
console.log(EQ);
const SUM = [
  ["sandbox (bare word)", /\bsandbox\b/gi],
  ["autoAllowBashIfSandboxed", /autoAllowBashIfSandboxed/gi],
  ["dangerouslySkipPermissions", /dangerouslySkipPermissions/gi],
  ["allowDangerouslySkipPermissions", /allowDangerouslySkipPermissions/gi],
  ["disallowedTools", /disallowedTools/gi],
  ["strictMcpConfig", /strictMcpConfig/gi],
  ["canUseTool", /canUseTool/gi],
  ["PreToolUse", /PreToolUse/gi],
  ["root/uid0 guard", /getuid\(\)\?\.?\(?\)?={0,2}0|remoteUid===0/gi],
  ["CONTROL invoke", /\binvoke\(/g],
];
for (const s of SUM) {
  let tot = 0, nf = 0;
  for (const f of main) {
    let t; try { t = fs.readFileSync(f, "utf8"); } catch { continue; }
    const c = countAll(t, s[1]); if (c) { tot += c; nf++; }
  }
  console.log("  " + s[0].padEnd(32) + String(tot).padStart(6) + "  files=" + nf);
}
console.log("");
console.log("DONE");