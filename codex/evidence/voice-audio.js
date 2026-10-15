"use strict";
// The dictation WebSocket handshake lives in MAIN. What captures the microphone?
// Hunt MAIN for the audio-capture side and for the chunked message sender.
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
      console.log("    " + ctx(it.text, m.index, w || 500));
    }
  }
  if (!n) console.log("  (no hits)");
}

hdr("A. audio capture in MAIN (is the mic opened here?)");
show(/microphone/gi, "microphone", 5, 600);
show(/\bmic\b/gi, "mic token", 4, 400);
show(/pcm|sampleRate|sample_rate|opus|aac|wav|Int16Array/i, "audio encoding hints", 6, 400);

hdr("B. dictation stream internals");
show(/dictation-stream-connect-info/g, "connect-info handler (full)", 2, 1500);
show(/getBackendRequestAuth/g, "backend auth", 3, 600);
show(/chatgpt-dictation/g, "chatgpt-dictation subprotocol", 3, 500);

hdr("C. realtimeVoice feature surface");
show(/realtimeVoice\w*/g, "realtimeVoice*", 8, 450);

hdr("D. chunked message sender (streaming transport)");
show(/chunkedMessageSender/g, "chunkedMessageSender", 4, 600);
show(/sendCritical/g, "sendCritical", 3, 500);
show(/codex-host-chunked-message-v1/g, "host chunked protocol id", 2, 800);