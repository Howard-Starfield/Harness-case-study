"use strict";
// Distinct literal forms of security-relevant keys across a corpus of files.
const fs = require("fs");
const path = require("path");
const root = process.argv[2];
const keys = process.argv.slice(3);

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|mjs)$/.test(e.name)) files.push(p);
  }
})(root);

for (const key of keys) {
  const forms = new Map(); // form -> {count, files:Set}
  let total = 0;
  for (const f of files) {
    const s = fs.readFileSync(f, "utf8");
    const re = new RegExp(key + "\\s*[:=]\\s*([^,;}\\n]{0,60})", "g");
    let m;
    while ((m = re.exec(s)) !== null) {
      total++;
      const form = m[0].slice(0, 80).replace(/\s+/g, " ");
      if (!forms.has(form)) forms.set(form, { count: 0, files: new Set() });
      const e = forms.get(form);
      e.count++;
      e.files.add(path.relative(root, f).replace(/\\/g, "/"));
    }
  }
  console.log(`\n## ${key}  — ${total} occurrences, ${forms.size} distinct forms`);
  [...forms.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 15)
    .forEach(([form, e]) => {
      const f = [...e.files];
      console.log(`   x${String(e.count).padStart(4)}  ${form}`);
      console.log(`          in: ${f.slice(0, 3).join(", ")}${f.length > 3 ? ` (+${f.length - 3} more)` : ""}`);
    });
}