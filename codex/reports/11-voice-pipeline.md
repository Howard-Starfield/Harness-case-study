# Codex 26.1007.2314.0 — Voice pipeline: capture, STT, streaming, and reply routing

**Report 11 of 11 — Target 2 (Codex desktop, MSIX `OpenAI.Codex_26.1007.2314.0_x64__2p2nqsd0c76g0`)**
Scope: security-posture and architecture of the voice path. Static analysis only. Nothing was launched.
Analysis date: 2026-10-13.

---

## 0. Method and corpora

| Corpus | Path | Files | Bytes | Chars (UTF-16) |
|---|---|---|---|---|
| MAIN | `.vite/build` | 34 | 10,333,165 | 10,250,479 |
| RENDER code | `webview` non-locale | 14,524 | 156,392,827 | 155,948,384 |
| RENDER locale | `webview` translation bundles | 258 | 227,096,998 | 184,642,514 |
| Whole extracted tree | `%TEMP%\codex-src` | 20,980 | 566,146,084 | — |

Counts are **occurrences in raw decoded JS text**. Corrections **C-P** (locale/code split) and **C-Q** (`AudioContext` case-flag artefact) are defined in Report 10 §1–§2 and applied throughout.

**Positive controls for every negative:** the same scanner, same corpus, same pass returns `useState` 6,799 (1,117 files), `onnxruntime` 2, `ort-wasm` 4, `ipcBridge` 24. A scanner that returns 6,799 for a control needle is not silently failing on the zeros.

---

## 1. Executive summary — the seven questions

| Question | Answer |
|---|---|
| Is there an STT engine? | **No local one.** Two server-side paths: WebSocket `/dictation/stream` (dictation) and **WebRTC to OpenAI realtime** (voice mode). No browser `SpeechRecognition` anywhere (0 occurrences, code + locale). |
| Is it local or server-side? | **Server-side for understanding.** Only voice-*activity detection* is computed locally, and even that model is fetched at runtime, not shipped. |
| Is there a local LLM? | **No.** Zero ML model files in 20,980 files; zero engines (`webllm`/`ollama`/`llama.cpp`/`transformers.js` all absent). A `setLocalModelSlug` setter exists but is a config value, not an inference path. |
| How does the transcript get to the orchestrator? | Turned audio is sent as an Opus RTP track; the server returns transcript + audio deltas on the **same** PeerConnection data channel. Dictation instead returns text over a WebSocket and it is pasted into the focused element. |
| Are streaming responses chunked? | **Yes, on both legs** — RTP transform frames inbound, and the main process re-chunks outbound into a priority queue with a `critical` lane. |
| How does it know which task a reply belongs to? | **Explicit addressing, three layers**: `CONVERSATION_ID` in the realtime session, `targetTurnId` + `targetTurnStartedAtMs` for steer, and a `to-task`/`from-task` delegation vocabulary for cross-task replies. |
| Does it do all the work itself? | **No.** The orb explicitly **delegates to other Codex tasks** and tracks their lifecycle. |

---

## 2. There are two separate voice systems. They are not the same thing.

Conflating these is the single biggest error available here.

### 2.1 Dictation — "type what I say", a *global OS-level* feature
Entry: `global-dictation-page-c8089ca3bf40.js` (28,389 bytes, `MediaRecorder`=1). 83 literals, all UI state.

States observed: `global-dictation-idle`, `microphone_ready`, `listening`, `transcribing`, `Transcribing…`, `recording-error`, `transcription-error`, `transcript_dispatched`, `audioLost:!1,reason:`, `retrySameAudioAvailable:!1,stopReason:e.chunks.length===0?'too-short'`, `No dictation audio to retry`, `show-retry`.

Its whole purpose is **pasting into other applications**: `globalDictation.pasteFailed.copiedShortCut`, `.notCopied`, `.copyToPaste`, `.enableAccessibility`, `.manualPaste`, `.settings` (*"Opens macOS settings to allow dictation to paste into other apps"*). So it is **simulated keystrokes via the macOS accessibility API**, not IPC into a Codex thread.

**Dictation is macOS-only.** `main @221630`: `if(process.platform!==\`darwin\` || e.length===0 && r==null) return null;` — the binding parser refuses to resolve on any non-Darwin platform.

### 2.2 Realtime voice — the talking orb, a *first-class Codex* feature
Entry: `voice-session-82332de4a122.js` (135,029 bytes). This is the orb conversation. It has its own model, reasoning effort, rate limits, plan gating, and **task delegation**.

---

## 3. Is anything local? The asset inventory answers it.

Scanned every file in the extracted tree by extension, looking for ML model containers:

| Extension | Files in tree |
|---|---|
| `.onnx` `.ort` `.tflite` `.pt` `.pth` `.gguf` `.ggml` `.bin` `.safetensors` `.mlmodel` `.pb` `.params` `.caffemodel` `.weights` | **0 — none of these appear anywhere** |

**34 `.wasm` files exist**, and none is an ML runtime:

- `orbit-characters.wasm` (6,656,898) and `single-thread/orbit-characters.wasm` (6,651,850) — the animated orb character runtime
- `Walnut.*.wasm` (3,027,225) + `DocumentFormat.OpenXml.*` + `System.*` — the **.NET / Blazor** document-rendering stack
- `dotnet.native.*.wasm` (1,523,858, tagged `[Emscripten]`)
- `wl_lvgl_wasm_bg.wasm` (1,646,651) — **LVGL**, the wlroots GUI toolkit
- 26 smaller .NET BCL component assemblies (`System.Net.Http`, `System.Linq`, `System.IO.Compression`, `System.Security.Cryptography`, …)

`.data` files: exactly **2**, both 3,548,847 bytes — the orb character's asset data. `.mts`: **5**, all orb-character type definitions.

> **Conclusion: the package ships no ML model of any kind. There is nothing local to run.**

### 3.1 The one local model is *fetched*, not shipped

`silero-vad-4ab7157f46dc.js` (51,456 bytes) runs a neural **voice-activity detector** in the renderer via ONNX Runtime Web:

```
ort-wasm-proxy-worker      ort-wasm-simd-threaded.mjs      init-wasm      init-ep
NCHW   NHWC   gpu-buffer   cpu-pinned   ml-tensor-cpu-output
env.wasm.numThreads        env.wasm.simd                  end-profiling
```

and it **verifies the model by hash before use**:

```
SHA-256
Silero VAD model has mismatch
Failed to fetch Silero VAD model: ${e.status}
Silero VAD failed to load
browserVoice.sileroVadUnavailable
Silero VAD is unavailable
```

`voice-dsp-209836305db2.js` selects the variant: `silero_v6`.

**Important nuance:** the model is fetched over HTTP at runtime — which is why no `.onnx` exists on disk. So even the local component depends on the network, and its integrity rests on that SHA-256 comparison. If the check fails, voice activity detection is unavailable (`browserVoice.sileroVadUnavailable`) — **fails closed**.

---

## 4. Speech-to-text: two server-side engines

### 4.1 Dictation STT — authenticated WebSocket

`main @688165` defines the transport constants:

```js
Rde = `/codex/dictation-stream-connect-info`
zde = `chatgpt-dictation`
Bde = `codex-desktop`
Vde = `openai-bearer.`
Hde = 12e4            // 120_000 ms timeout
```

`main @704721` — the connect-info handler, in full logic:

```js
let n = await this.getAppServerConnection(l.h)
            .getBackendRequestAuth({refreshToken: !1});
if (n == null) throw Error(`Sign in to ChatGPT to use dictation.`);
if (n.routing.kind === `workspace`) throw Error(`Use HTTP transcription for this workspace.`);
...
bodyJsonString: JSON.stringify({
  websocketUrl: this.getDictationStreamWebsocketUrl(),
  protocols: [zde, `${Vde}${n.token}`, Bde]
})
```

Error responses use HTTP status **432**. `getDictationStreamWebsocketUrl()` rewrites `/dictation/stream` and upgrades `https:` → `wss:`. The second call site (`main @1100392`) hits `/dictation/stream?dictation_surface=${t}` with `maxPayload: 8388608` and `followRedirects: !1`.

**The bearer token is placed in the WebSocket subprotocol**, not a header — a browser-safe pattern since the WebSocket API cannot set headers. The token is minted with `refreshToken: false`, so a refresh failure surfaces as a sign-in error rather than a silent retry loop.

**Workspace accounts are excluded by design** — an explicit, early, user-visible refusal.

### 4.2 Realtime voice STT/TTS — WebRTC directly to OpenAI

`voice-session-parameters-e132baafb255.js` (52,448 bytes) is the transport:

```
RTCDepPeerConnection = 3     addTransceiver = 2
inbound-rtp      outbound-rtp      audio      inbound-audio-${t}
RTCRtpScriptTransform        // sender AND receiver
webrtc-cert-db   ECDSA   P-256   ecdsa-p256:v1
https://chatgpt.com     https://chatgpt-staging.com
OAI-Location     oai-ll
/conversation/voice/status      ${...}/realtime/status
```

**This is the OpenAI Realtime API over WebRTC.** Evidence: `gpt-4o` + `have-local-offer` (the browser generates the SDP offer and sends it), `/realtime/status`, and the session-parameter field set that matches the Realtime API session shape:

```
CONVERSATION_ID      BACKEND_MODE      CHAT_MODE       GIZMO_ID
SYSTEM_PROMPT_TYPE   TEMPORARY_CONVERSATION
MODEL_SLUG           MODEL_SLUG_ADVANCED     BACKEND_REASONING_EFFORT
VOICE                LANGUAGE_CODE
```

### 4.3 Security-posture note (F14, medium)

**Voice media bypasses the app-server.** The renderer opens a PeerConnection to `chatgpt.com` directly. Audio frames never pass through the main process, so none of the main-process controls documented in Reports 02–03 apply to the voice path. The main process's role is reduced to *minting the URL/token*. Concretely:

- The `fetch`-interception layer that governs ordinary API traffic does not cover RTP.
- `getBackendRequestAuth` gates *who*, not *what media*.
- Per-message send-locks and follower priorities (Report 10 §5, §7.2) do not apply to the voice session.
- The presence of `https://chatgpt-staging.com` in the same chunk means a build-time or config-level switch can redirect live audio to a staging endpoint.

Mitigating factor: `micropbone_permission_eligibility_enabled` and the explicit `composer.realtime.microphonePermissionError` (*"Microphone access is required to start voice chat"*) mean the microphone is still gated by the OS.

---

## 5. Local audio processing — what actually happens on-device

Three AudioWorklets, all client-side:

| Worklet module | Bytes | Role |
|---|---|---|
| `voice-vad-frame-processor-b6bea101f49a.js` | 943 | `voice-vad-frame-processor` — runs Silero VAD per audio frame |
| `dictation-audio-worklet-5c2f03781068.js` | 866 | `dictation-audio` |
| `codex-realtime-buffered-audio-worklet-550138dc2d39.js` | 3,395 | buffered realtime capture; emits `capture-started`, `phase-changed`, `mute-applied` |

`voice-dsp-209836305db2.js` (26,374 bytes) orchestrates: `AudioContext=1`, `getUserMedia=3`, `createMediaStreamSource=1`, plus **ducking** (`duckingDevicePolicy`, `manualDuckingControl`, `this.vadType`) so assistant audio lowers when the user speaks.

**Microphone arbitration** is explicit — the literal `Microphone is owned by dictation` appears in `voice-dsp`. Dictation and voice cannot hold the mic simultaneously.

`app-initial` also contains `getUserMedia` in the orb path and `MediaRecorder` in 2 sites — recording is available but the dominant dictation path is the WebSocket stream.

---

## 6. Transcript → orchestrator, and routing to the right task

This is the part the user specifically asked about, and Codex answers it in three explicit layers.

### 6.1 Conversation addressing — `CONVERSATION_ID`
The realtime session is created with an explicit `CONVERSATION_ID`, so the server-side conversation is bound at session start, not inferred from "whatever is focused".

### 6.2 Within a turn — `targetTurnId` + `targetTurnStartedAtMs`
`conversation-turn-mutations-szl89rld.js`:

```js
var yn = `Interrupted before the steer was accepted.`;
{ type:`steeringUserMessage`, id, targetTurnId, targetTurnStartedAtMs,
  status:`pending`, serverUserMessageId:null, clientUserMessageId, input, attachments, ... }
```

`targetTurnStartedAtMs` is a **race guard**: a reply aimed at a turn that has since been replaced is refused rather than misdelivered.

### 6.3 Across tasks — the voice orb *delegates*

`avatar-overlay-native-page-c254d4864d6b.js` (343,699 bytes) carries a complete delegation vocabulary. Its own UI copy states the behaviour:

```
realtimeVoice.taskCreated.body    "Body shown when realtime voice delegates work to another Codex task"
realtimeVoice.taskCreated.title   "Title shown when realtime voice creates another Codex task"
realtimeVoice.taskCreatedWithTitle.title
realtimeVoice.taskReturned.title  "Title shown when another Codex task finishes work for realtime voice"
realtimeVoice.taskUpdate.title    "Title shown when another Codex task sends a progress update to realtime voice"
realtimeVoice.taskMessageSent.title "Title shown when realtime voice sends another Codex task a message"
realtimeVoice.taskUpdate.{running, completed, interrupted, failed, stopped, notFound, generic}
```

Routing tokens: `to-task`, `from-task`, `thread-created`, `thread-message`, `thread-created`, `app-server-conversation`, `multi-agent`, `remote-host`, `voice.realtime`.

`realtime-voice-handoff-target-3c0ded48774f.js` (2,640 bytes) defines **where a realtime session attaches**, with exactly three values:

```
global-overlay | main-thread | in-window
```

and `realtime-voice-codex-status-signal-1cd1a86acfce.js` (4,337 bytes) renders what the delegated work is doing on the orb:

```
realtimeVoice.codexStatus.thinking          "Status shown below the realtime voice transcript while Codex works"
realtimeVoice.codexStatus.runningCommand    file-change
realtimeVoice.codexStatus.editingFiles      waitingForThread
realtimeVoice.codexStatus.searchingWebFor   additionalTools
```

Per-conversation addressing on the orb itself: `avatarOverlay.transcript.openOrbitThread.dot`, `data-quick-chat-control`, and the accessibility label *"Back button above the selected dot's conversation in Mini. Collapses the transcript while keeping that dot selected."* — **each orb dot holds an independent, individually addressable conversation.**

### 6.4 Session-start guards
```
avatarOverlay.realtime.workspaceNotReady     "Voice chat cannot start until the workspace is ready"
avatarOverlay.realtime.sessionAlreadyStarting "Voice chat is already active or starting in another window"
avatarOverlay.realtime.startInterrupted
```
Plus `On.realtimeVoiceRuntime?.cancelRealtimeSessionStart()` — an explicit cancel hook.

---

## 7. Streaming and chunking

**Inbound (server → orb).** `RTCRtpScriptTransform` is attached to **both** the sender and receiver transceivers, so raw Opus frames are accessible in JS on each leg and can be fed to the VAD worklet without a WebAudio round-trip. The transcript placeholder is explicit:

```
voice-completion-request.transcribing
"Placeholder for the user's speech while its transcription is being received in a voice conversation"
```

**Outbound (orb → renderer).** The main process re-chunks into a two-lane priority queue — `main @704721`:

```js
t.responsePriority === `critical`
  ? this.options.chunkedMessageSender.sendCritical(e, g.bt, i)
  : this.options.chunkedMessageSender.sendInlineMessageForView(e, i)
```

**Ordinary (non-voice) text streaming** uses the delta protocol: `item/agentMessage/delta` 16, `item/reasoning/textDelta` 6, `outputDelta` 32, `turn/diff/updated` 5, `turn/started` 27, `turn/completed` 31 (MAIN).

**Renderer rendering** is CSS-driven, not per-token React: `avatar-overlay-native-page` carries `shrink-0`, `--mini-transcript-max-height`, `data-message-send-animating`, `data-mini-send-pending`, and height/width/transform transitions on `[data-orb-message]`.

---

## 8. Text-to-speech

**There is no TTS engine for the orb.** Assistant audio arrives as an RTP stream from the realtime session; it is not synthesised locally.

The corpus-wide `speechSynthesis` count is **11 in 6 files**, and `SpeechSynthesisUtterance` is **2 in 1 file** — and that one file is `mathlive.min-c4bd9636f76e.js`, the third-party maths typesetting library, where it is an accessibility feature. The other `speechSynthesis` hits are in `frame-`, `tooltip-`, `response-`, `runtime-` — generic framework/vendor chunks.

Also notable: `chatgpt.voice.assistant_audio_playback_blocked.toast` — *"Audio playback was blocked. Tap or click to resume."* Assistant audio is subject to autoplay policy.

---

## 9. Gating and rate limits

Voice is not universally available. From `voice-session-82332de4a122.js`:

```
chatgpt.voice.globalCapacityUnavailableModal.title   "Voice is currently unavailable"
chatgpt.voice.globalCapacityUnavailableModal.confirm "Voice Mode Upgrade To Plus Modal"
chatgpt.voice.globalCapacityUnavailableModal.…       "Voice Mode Upgrade To Pro Modal"
chatgptConversations.rateLimitBanners.dismiss        "Voice Rate Limit" / "Markdown Pricing Link"
chatgpt.workspace.feature.voice.access
```

So realtime voice is **plan-tier gated (Plus/Pro) and capacity limited**. This is a business/entitlement boundary, not a technical capability of the binary.

`voice_reasoning_effort` is a **separate setting from the text-mode reasoning effort** — the orb has its own reasoning dial.

---

## 10. Findings

| ID | Sev | Finding |
|---|---|---|
| **F14** | **medium** | **Voice media bypasses the main process.** The renderer opens a WebRTC PeerConnection to `chatgpt.com`; RTP audio does not traverse the app-server, so main-process fetch interception, IPC allowlisting, and thread send-locks do not govern it. Mitigated by OS mic permission gating and by `getBackendRequestAuth` controlling *who* can connect. |
| **F15** | medium | **Staging endpoint co-located in the voice transport chunk.** `https://chatgpt-staging.com` sits beside `https://chatgpt.com` in the same module. A config or build-time flip could route live microphone audio to staging. Reachability not established statically. |
| **F16** | low | **Silero VAD model is fetched at runtime, not bundled.** Integrity rests on a single SHA-256 comparison performed client-side. A failure is handled correctly (`browserVoice.sileroVadUnavailable`, fails closed), but there is no signature beyond the hash. |
| **F17** | info | **Dictation simulates keystrokes via macOS accessibility** (`globalDictation.pasteFailed.*`, "Opens macOS settings to allow dictation to paste into other apps"). This is the documented capability; it is gated behind an explicit OS permission and a settings deep-link. |
| **F18** | info | **Microphone arbitration is explicit and single-owner** (`Microphone is owned by dictation`), preventing dictation and realtime voice from contending for capture. |
| **F19** | info | **Autoplay policy is respected** for assistant audio (`chatgpt.voice.assistant_audio_playback_blocked.toast`). |
| **F20** | info | **Voice delegates rather than self-executing.** Cross-task routing is first-class (`to-task`/`from-task`, `taskUpdate.*`), with the orb rendering the delegate's status. |

---

## 11. What this report does NOT establish

1. **No runtime verification.** Nothing was launched. Whether the WebRTC session actually negotiates Opus, what the TURN topology is, and whether `targetTurnStartedAtMs` rejects stale steers in practice are all untested.
2. **Server-side model identity is inferred.** `gpt-4o`, `MODEL_SLUG`, `/realtime/status` are client-side strings; the authoritative model assignment happens server-side and is not observable here.
3. **"whisper" appears 15 times in 7 files** (code + locale). Despite the name, no Whisper model file exists in the package and no inference runtime is present, so these are UI/registration strings, not an STT engine. I have not individually read all 15 sites.
4. **The Silero VAD model's download URL and hash are not in the artifact** — they are resolved at runtime, so the integrity check could not be evaluated against a known-good value.
5. `.wasm`/`.data`/`.mts` assets are outside the `.js|.mjs|.cjs` corpus used for the term census; they are inventoried separately in §3 and `evidence/voice-local.txt`.

---

## 12. Evidence index

| File | Contents |
|---|---|
| `evidence/voice-render.txt` | Renderer scan A — independent 13-pass census |
| `evidence/voice-render3.txt` | Renderer scan B — independent single-pass census |
| `evidence/voice-render4.txt` | **C-P** code/locale split, **C-Q** AudioContext reconciliation |
| `evidence/voice-chunks.txt` | Per-chunk API census + literal dump for 18 voice chunks |
| `evidence/voice-local.txt` | ML-extension inventory (0), 34-wasm inventory, engine-name scan with controls, char counts |
| `evidence/voice-deep.txt` | MAIN contexts: dictation constants, voice commands, followUp, steer |
| `evidence/voice-audio.txt` | Full `handleDictationStreamConnectInfoRequest`, `getBackendRequestAuth`, mic state machine |
| `evidence/voice-disc.txt` | MAIN discovery census |

Scans A and B are independent re-derivations; where they disagreed (§ Q) the disagreement was resolved per-file rather than averaged.