"use strict";
// Deep read of: dictation (the voice feature), AGENTS.md (the MD task record),
// Orb<Cap>, voice-mode, and the turn queueing/routing machinery.
const fs = require("fs");
const SRC = process.env.TEMP + "\\codex-src";
const B = SRC + "\\.vite\\build";
const EQ = "=".repeat(76);
function hdr(t) { console.log("\n" + EQ + "\n== " + t + "\n" + EQ); }

const files = fs.readdirSync(B).filter((f) => /\.(js|mjs)$/i.test(f));
const ALL = files.map((f) => ({ name: f, text: fs.readFileSync(B + "\\" + f, "utf8") }));
const ctx = (t, i, w) => t.slice(Math.max(0, i - w / 2), Math.min(t.length, i + w / 2)).replace(/\s+/g, " ");

function show(re, label, limit, w) {
  console.log("\n" + "-".repeat(76) + "\n-- " + label);
  let n = 0;
  for (const it of ALL) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(it.text)) !== null) {
      n++;
      if (n > limit) break;
      console.log("\n  [" + it.name + " @" + m.index + "] " + m[0].slice(0, 90));
      console.log("    " + ctx(it.text, m.index, w || 480));
    }
  }
  if (!n) console.log("  (no hits)");
}

hdr("1. AGENTS.md  - the MD record of what needs doing");
show(/AGENTS\.md/g, "AGENTS.md literals", 4, 900);

hdr("2. memory md/json references");
show(/memory\.(?:md|json)/gi, "memory.md / memory.json", 4, 700);
show(/memoryPipeline/g, "memoryPipeline", 4, 800);

hdr("3. Orb component");
show(/Orb[A-Z]\w*/g, "Orb<Cap>", 4, 600);

hdr("4. voice-mode");
show(/voice-?mode/gi, "voice-mode", 6, 700);

hdr("5. dictation - the voice feature");
show(/\bdictation\w*/gi, "dictation tokens", 8, 700);

hdr("6. turn queueing / routing");
show(/follow-?[Uu]p/g, "followUp", 5, 600);
show(/\bsteer\w*/gi, "steer", 5, 600);