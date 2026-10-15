"use strict";
// Round 7: calibrate the "fuse sentinel not found" negative before reporting it.
// A 0-hit result is only meaningful if the scan can find the needle where it exists.
const fs = require("fs");
const path = require("path");
const ROOT = "C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.1007.2314.0_x64__2p2nqsd0c76g0";
const APP = path.join(ROOT, "app");
const EQ = "=".repeat(74);
function hdr(t) { console.log("\n" + EQ + "\n== " + t + "\n" + EQ); }

const SENTINEL = Buffer.from("dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX", "ascii");

// Control needle: a string that MUST exist in a Chromium/Electron binary.
const CONTROLS = {
  "Electron marker 'Electron'": Buffer.from("Electron", "ascii"),
  "Chromium marker 'Chrome/'": Buffer.from("Chrome/", "ascii"),
  "asar sentinel sentinel: 'app.asar'": Buffer.from("app.asar", "ascii"),
  "fuse SENTINEL": SENTINEL,
  "fuse sentinel 8-byte prefix": SENTINEL.subarray(0, 8),
  "fuse sentinel 4-byte prefix": SENTINEL.subarray(0, 4),
};

const targets = ["ChatGPT.exe", "Codex.exe", "chrome.dll", "chrome_elf.dll",
                 "elevation_service.exe", "elevated_tracing_service.exe"];

hdr("FUSE SENTINEL CALIBRATION across app/ binaries");
for (const rel of targets) {
  const p = path.join(APP, rel);
  if (!fs.existsSync(p)) { console.log("  " + rel + ": absent"); continue; }
  const b = fs.readFileSync(p);
  const line = [];
  for (const [label, needle] of Object.entries(CONTROLS)) {
    const at = b.indexOf(needle);
    line.push(label + "=" + (at < 0 ? "ABSENT" : "0x" + at.toString(16)));
  }
  console.log("\n  " + rel + "  (" + b.length.toLocaleString() + " B)");
  for (const l of line) console.log("      " + l);
}

hdr("OWL SHELL CONFIG FILES");
for (const rel of ["owl-shell-runtime.json", "owl-electron-app.json", "owl-app.ini",
                   "155.0.8059.40.manifest", "resources\\owl-electron-app.json",
                   "resources\\owl-app.ini", "resources\\masque-proxy-origins.txt"]) {
  const p = path.join(APP, rel);
  if (!fs.existsSync(p)) { console.log("\n  " + rel + ": ABSENT"); continue; }
  const st = fs.statSync(p);
  console.log("\n  --- " + rel + "  (" + st.size + " B) ---");
  console.log(fs.readFileSync(p, "utf8").trim().split("\n").map((l) => "      " + l).join("\n"));
}

hdr("Is this Chromium or Electron? package markers");
for (const rel of ["ChatGPT.exe", "chrome.dll"]) {
  const p = path.join(APP, rel);
  if (!fs.existsSync(p)) continue;
  const b = fs.readFileSync(p);
  const m = b.toString("latin1");
  const probes = {
    "Electron/": m.indexOf("Electron/"),
    "Chrome/": m.indexOf("Chrome/"),
    "Electron " : m.indexOf("Electron "),
    "NSBundle Electron": m.indexOf("NSBundle"),
    "node::": m.indexOf("node::"),
    "v8::": m.indexOf("v8::"),
    "Chromium": m.indexOf("Chromium"),
  };
  console.log("\n  " + rel);
  for (const [k, v] of Object.entries(probes)) console.log("      " + k.padEnd(20) + (v < 0 ? "ABSENT" : "0x" + v.toString(16)));
}