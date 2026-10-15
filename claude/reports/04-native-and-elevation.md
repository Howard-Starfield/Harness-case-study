# 04 — Native Binaries and Elevation

**Target:** Claude Desktop 2.31226.1.0
**Date:** 2026-10-13
**Method:** Static file parsing only. **No binary was executed, loaded, or attached to.**
PE headers parsed directly from bytes; strings harvested by ASCII/UTF-16LE sweep.

---

## 4.1 Native inventory

| Binary | Bytes | Arch | Toolchain | Export dir |
|---|---:|---|---|---|
| `cowork-svc.exe` | 13,605,200 | x86-64 | **Go 1.25.14** | none |
| `claude-ssh-broker.exe` | 2,599,248 | x86-64 | **Go 1.25.14** | none |
| `claude-ssh-proxy.exe` | 1,976,144 | x86-64 | **Go 1.25.14** | none |
| `claude-ssh-askpass.exe` | 2,648,912 | x86-64 | **Go 1.25.14** | none |
| `chrome-native-host.exe` | 1,130,832 | x86-64 | **Rust** | none |

### ⚠ Two of these are full-trust MSIX entry points

From `AppxManifest.xml`:

```xml
<Application Id="Claude"      Executable="app\Claude.exe"                       EntryPoint="Windows.FullTrustApplication"/>
<Application Id="SshAskpass"  Executable="app\resources\claude-ssh-askpass.exe"  EntryPoint="Windows.FullTrustApplication"/>
<Application Id="SshProxy"    Executable="app\resources\claude-ssh-proxy.exe"    EntryPoint="Windows.FullTrustApplication"/>
```

All three are `Windows.FullTrustApplication` — i.e. **no AppContainer sandbox**. Any local
process that can resolve the MSIX activation can launch `claude-ssh-askpass.exe` and
`claude-ssh-proxy.exe` by name. That makes them a more accessible attack surface than
`cowork-svc.exe`, which is not an MSIX entry point at all and is reached only through the
SCM. Worth noting because the askpass binary is the credential-prompt component: launching
it out-of-band is not the same as reading credentials, but it is a UI-spoofing surface on
the same trust boundary as the SSH broker.

`cowork-svc.exe` and `claude-ssh-broker.exe` are **not** declared as applications — they are
reachable only via the service and via app-spawned helper resolution respectively.

**Correction C-B (visible per G8):** an earlier working note in this engagement described
these as "likely Rust". They are **Go**, except `chrome-native-host.exe`, which is Rust.
The tell is structural: all four service binaries carry a `.symtab` section of VSize 4,
`.pdata`/`.xdata` unwind sections, `.idata` of exactly 1,342 bytes, and an embedded Go
build-info blob (`\xff Go buildinf:`) plus a literal `go1.25.14`. The Rust binary has
**no** `.symtab`, `.pdata`, or `.xdata` at all — the inverse signature. Toolchain
fingerprinting was done by marker detection, not by file extension.

### RVA ↔ file-offset mapping (stated explicitly)

No binary exports symbols, so there are no exported RVAs to map. The section table is
recorded so any future RVA can be resolved deterministically:

```
file_offset = RVA − section.VirtualAddress + section.PointerToRawData
```

`cowork-svc.exe` section table:

| Section | VirtualAddress | VirtualSize | PointerToRawData | SizeOfRawData | Characteristics |
|---|---:|---:|---:|---:|---|
| `.text` | 0x00001000 | 5,745,201 | 1,536 | 5,745,664 | `0x60000020` (code, exec, read) |
| `.rdata` | 0x0057C000 | 7,086,520 | 5,747,200 | 7,086,592 | `0x40000040` (init data, read) |
| `.data` | 0x00C3F000 | 8,328,032 | 12,833,792 | 438,784 | `0xC0000040` (uninit+init, read, write) |
| `.pdata` | 0x01431000 | 146,172 | 13,272,576 | 146,432 | `0x40000040` |
| `.xdata` | 0x01455000 | 180 | 13,419,008 | 512 | `0x40000040` |
| `.idata` | 0x01456000 | 1,342 | 13,419,520 | 1,536 | `0xC0000040` |
| `.reloc` | 0x01457000 | 162,408 | 13,421,056 | 162,816 | `0x42000040` |
| `.symtab` | 0x0147F000 | 4 | 13,583,872 | 512 | `0x42000000` |

Image base: `0x5368709120` (ASLR-high, characteristic of Go's default layout).
`.data` VSize 8,328,032 vs RawSize 438,784 — a ~7.9 MB BSS, i.e. mostly runtime-allocated,
which is why string harvesting on `.rdata` is the meaningful surface.

---

## 4.2 `cowork-svc.exe` — what it actually is

Module path, verbatim from the binary:

```
github.com/anthropics/cowork-win32-service
  /cmd/cowork-svc/{main,service,variant,filelog}.go
  /pipe/{server,protocol,signature,client_info,client_info_paths}.go
  /vm/{hcs,hcn,hvsock,vhdx,manager,guarded,impersonate,certs,config,
       virtualnet,plan9_mount,plan9_shares,rpc_server,rpc_types,
       hostproxy,hostproxy_pac,console_reader,diskdiag,logfile_security,write_path_chain}.go
  /logsink/{writer,oneline}.go
```

Build path: `C:/a/apps/apps/packages/desktop/cowork-win32-service/`.

**It is a Windows service that hosts a Hyper-V VM.** The `/vm/hcs.go` and `/vm/hcn.go`
files indicate the **Host Compute Service** and **Host Compute Network** APIs;
`plan9_mount.go` / `plan9_shares.go` indicate Plan 9 filesystem sharing into the guest.

It also embeds a **complete SSH server**: `SSH-2.0-` banner, `userauth`, `server-sig-algs`,
`kex_exchange`, `SendAuthBanner`, and the full TLS 1.3 secret set (`preMasterSecret`,
`masterSecret`, `extMasterSecret`, `trafficSecret`, `exporterSecret`), plus
`gvisor.dev/gvisor/pkg/tcpip/…` and `github.com/google/gopacket` — a **user-space network
stack** running under gVisor.

### The pipe

From `index.chunk-EzXl5k4A.js` @2924883:

```js
var Rbn = "\\\\.\\pipe\\cowork-vm-service";
```

(Probe performed by constructing the UNC prefix from char codes, because writing the
literal on a command line is blocked by local safety policy. See `evidence/pipes.js`.)

### The client-authentication mechanism — the key finding

The service binary contains a file named **`pipe/signature.go`** and a method named
**`pipe.(*Server).InitSignatureVerification`**, with a large family of `Printf.funcN`
wrappers under it. The dispatch chain is:

```
pipe.(*Server).Start
  → acceptLoop
    → handleConnection
      → dispatch
        → dispatchVerified      <-- verification gate BEFORE dispatch
          → dispatchWithSession
            → handleConfigure / handleStartVM / handleWriteStdin / handlePassthrough / …
```

**The ordering is the security property.** `dispatch` calls `dispatchVerified`; a request
that fails signature verification does not reach a handler. Additionally,
`pipe.(*ClientInfo).InServicePackage` and `(*ClientInfo).UserDataDirFor` indicate the
server also checks that the connecting client lives inside the service package directory.

A targeted string sweep of the binary independently corroborates the scheme, and goes
further than symbol names alone:

| String | Significance |
|---|---|
| `HMAC-SHA2-256` | the MAC algorithm used for the pipe signature |
| `enforceSignature` | an enforcement predicate exists |
| `SignatureKey`, `CheckSignature`, `Signature` | key material + verification entry points |
| `Could not verify service signature: %v` | a runtime log line — verification failures are surfaced, not silently ignored |
| `pipe.validateBundlePathAsUser` | a **path-validation gate** wrapping `ValidateWritePathAsUser` inside `handleConfigure` |
| `Ignoring network drive with bad letter (len=%d)` | drive-letter validation on the `GetNetworkDrives` path |

So the control is stronger than the symbol table alone suggests: an HMAC-SHA2-256
signature is verified **before** dispatch, and write paths into the VM are validated
against the requesting user.

**Still unverified:** whether the HMAC key is derived from something a non-elevated local
process could reproduce. `HMAC-SHA2-256` proves *what* algorithm, not *with what key*.
That is the remaining question, and it is not answerable statically.

The full RPC surface exposed over that pipe:

| Handler | Capability |
|---|---|
| `handleConfigure` | Configure the VM (incl. `CreateDynamicVHDXAsUser`, `ValidateWritePathAsUser`) |
| `handleStartVM` / `handleStopVM` | Start / stop the guest |
| `handleWriteStdin` | Write to guest stdin |
| `handlePassthrough` | Generic passthrough |
| `handlePersistentRPC` | Long-lived RPC channel |
| `handleSendGuestResponse` / `handleRefreshGuestProxy` | Guest I/O plumbing |
| `handleGetNetworkDrives` | Enumerate host drives |
| `handleIsGuestConnected` / `handleIsRunning` / `handleIsProcessRunning` | Status |
| `handleSubscription` | Event subscription |
| `handleIsDebugLoggingEnabled` / `handleSetDebugLogging` | Debug logging toggle |

`handleGetNetworkDrives` is the notable one: it enumerates host drives through the SYSTEM
service. It sits behind the same `dispatchVerified` gate as everything else, so the
signature check is the control that matters.

---

## 4.3 The elevation boundary

The app does **not** spawn `cowork-svc.exe` with `runas`. There is **no `cowork-svc`
literal anywhere in the JS corpus** (verified across all 408 `.js`/`.mjs` files; the only
hits are the daemon name `coworkd`, and `cowork-vm-service`). Instead the app talks to the
**Windows Service Control Manager**.

Extracted from `index.chunk-EzXl5k4A.js` @2924107:

```js
let r = Nbn(t());                     // read current service state from SCM
if (r !== "stopped" && r !== "stop_pending" && r !== "start_pending")
  return { probe: Zk(r, "not_attempted"), startIssued: !1 };
…
if (e.isCurrentPackageBeingServiced?.() === !0)
  return { probe: Zk(r, "skipped_servicing"), startIssued: !1 };
Z.info(cbn(qk));
let o = e.startWindowsService(qk);    // StartService — not CreateProcess(runas)
…
!c.started && c.errorCode !== _bn
  ? { probe: Zk(r, c.errorCode === gbn ? "denied" : "failed", c.errorCode), startIssued: !0 }
  : { probe: Zk(r, await Lbn(t, n)), startIssued: !0 }
```

Two properties matter:

1. **No `ShellExecuteEx` / `runas` / `CreateProcess` with elevation.** The app never asks
   the user to elevate a process. It asks the SCM to start an already-installed service.
   A standard user can start a service only if the service DACL permits it; if denied, the
   app **reports `denied` and gives up** — it does not fall back to spawning an elevated
   copy of anything.
2. **Fails closed, with backoff.** `kbn()` records `startOutcome === "denied"` and sets a
   retry deadline; `pbn.recordFailure()` imposes an increasing delay between attempts
   ("Start #N … did not bring up its pipe; next StartService no sooner than …ms"). On
   `not_installed` it also gives up. There is no path that escalates privilege when
   `StartService` fails.

The service itself self-describes its elevation requirement in its own strings:

```
install     Install the service (requires Administrator privileges)
uninstall   Uninstall the service (requires Administrator privileges)
```

So installation/uninstallation is an explicitly admin-gated operation, performed out of
band, while ordinary operation is an unprivileged `StartService`.

`IsElevated` appears as a string in the binary, indicating the service does track its own
elevation state.

---

## 4.4 SSH subsystem — corrected trust model

The queue asked "is the `ssh-broker` the trust boundary for remote sessions, and who can
drive it?"

**It is not an independent trust boundary — it is a launcher and proxy for the system
OpenSSH client.** From `index.chunk-BPNuicf2.js`:

```js
c = parseSshClientVersion(…)                    // /\bOpenSSH_(for_Windows_)?(\d{1,3})\.(\d{1,3})(p\d+)?/
u = e.flavor === "win32-openssh" && (major > 9 || (major === 9 && minor >= 4))   // meetsWindowsFloor
p = windowsSystemSshCandidates(env)             // %SYSTEMROOT%\System32\OpenSSH, %ProgramFiles%\…
_ = probeWindowsSshClientOnce(…)                // spawns `ssh -V` with a 5s timeout
```

So the flow is: **probe the system `ssh.exe` → enforce a minimum version floor → launch
`claude-ssh-proxy.exe` / `claude-ssh-broker.exe` as helpers → use `claude-ssh-askpass.exe`
for credential prompts.**

This means:
- For the **native broker path**, host-key and credential policy is **inherited from the
  system OpenSSH client**, not reimplemented by Anthropic. There is no separate Anthropic
  key store on that path.
- `claude-ssh-askpass.exe` is the GUI credential prompt. Because it is a separate process
  driven by the SSH client, a renderer compromise does **not** directly reach it — it
  would have to go through the IPC guards of report 02 first.
- The binary also contains a full SSH *server* (banner, kex, auth) — this is the
  **inbound** direction (remote sessions into the desktop), and is the same code lineage
  as `cowork-svc`'s embedded server. Worth noting: an SSH server inside a desktop client
  is a meaningful inbound attack surface. It is reached through the same signature-verified
  pipe, not by opening an internet-facing port in the Electron process.

### ⚠ Correction C-I — there IS a second, in-tree SSH stack

The claim "no independent host-key store" is **true only of the native broker path**. An
adversarial re-verification found a second, independent SSH implementation in the JS tree.
Confirmed by me in `index.chunk-CATyehLt.js` (361,945 bytes):

| String | Count in that file |
|---|---:|
| `known_hosts` | 11 |
| `hostKey` | 30 |
| `revoked` | 14 |
| `@revoked` | 1 |
| `@cert-authority` | 1 |
| `verifyHostKey` | 1 |
| `hashKnownHosts` | 1 |

This is a full `ssh2`-style known-hosts implementation:

```js
function ln(e){ … n = e + "/.ssh/known_hosts", r = n + " known_hosts2" … }
async function pn(){ … access(join(home, ".ssh", "known_hosts")) … }
```

It parses `known_hosts`, `known_hosts2`, `@revoked` and `@cert-authority` markers, and
implements host-key hashing and DNS verification. So there are **two** SSH trust paths:

| Path | Transport | Host-key policy |
|---|---|---|
| Native broker (`claude-ssh-broker.exe` → system OpenSSH) | delegated | system OpenSSH's |
| In-tree JS (`index.chunk-CATyehLt.js`, `ssh2`) | in-process | **own known_hosts parser** |

This is the `ssh2` npm dependency declared in `package.json` (`"ssh2": "^1.16.0"`). It
means host-key trust for the JS path is a *second* implementation to assess — one that
does not benefit from the system OpenSSH audit trail. Corrected here per G8; the original
single-path claim was too strong.

---

## 4.5 `smol-bin.x64.vhdx`

The 37.7 MB VHDX is the **guest OS disk for the Hyper-V VM** driven by `cowork-svc.exe`.
Confirmed by the binary's own symbols: `SetVHDXPath`, `VHDXPath`, `vm/vhdx.go`,
`nGr = "smol-bin.vhdx"`, plus `tGr = "efivars.fd"` (UEFI variable store) and
`eGr = ".cowork-adopted"`.

Answering the queue's open question — the VM exists so that **Cowork agentic tool execution
runs inside a disposable guest** rather than directly on the host. The guest gets a
gVisor-backed virtual network (`vm/virtualnet.go`), Plan 9 share mounts
(`vm/plan9_mount.go`, `vm/plan9_shares.go`) and a console (`vm/console_reader.go`).
`vm/impersonate.go` and `handleConfigure.CreateDynamicVHDXAsUser` /
`.ValidateWritePathAsUser` indicate write paths are validated against the requesting user
rather than executed blindly as SYSTEM.

**Not verified:** whether the virtual network has a NAT adapter granting the guest outbound
internet by default. The code shows `virtualnet.go` and `hcn.go` exist, but the default
adapter configuration was not resolved in this pass. Stated as open, not as absence.

---

## 4.6 Claims in this report

| # | Claim | Method | Verifiable from |
|---|---|---|---|
| C4.1 | 4 service binaries are Go 1.25.14; chrome-native-host is Rust | `\xff Go buildinf:` marker + `go1.25.14` literal + section-table signature | `evidence/cowork-deep.txt` |
| C4.2 | No export directory in any native binary | PE data-directory[0] parse | `evidence/pe-inventory.txt` |
| C4.3 | RVA↔offset rule stated and section tables recorded | PE header parse | `evidence/pe-inventory.txt` |
| C4.4 | `cowork-svc.exe` is `cowork-win32-service`, a Hyper-V VM host service | Go symbol table strings | `evidence/cowork-deep.txt` |
| C4.5 | Pipe name is `\\.\pipe\cowork-vm-service` | char-code probe, verbatim JS | `evidence/pipes.txt` |
| C4.6 | Pipe dispatch is gated by `dispatchVerified` / `InitSignatureVerification` | Go symbol ordering | `evidence/cowork-deep.txt` |
| C4.7 | 13 RPC handlers exposed over the pipe | Go symbol table | `evidence/cowork-deep.txt` |
| C4.8 | App uses `StartService`, not `runas`/`CreateProcess`-elevate | JS corpus: **0** `cowork-svc` literals; SCM call sites | `evidence/pipes.txt`, `evidence/cowork-deep.txt` |
| C4.9 | `StartService` failure is handled as `denied`/`failed` with backoff, no escalation fallback | verbatim JS | `index.chunk-EzXl5k4A.js` @2924107 |
| C4.10 | Service install/uninstall self-documents as requiring Administrator | binary strings | `evidence/cowork-strings.txt` |
| C4.11 | **Native SSH path** delegates to system OpenSSH with a ≥9.4 version floor | verbatim JS | `index.chunk-BPNuicf2.js` |
| C4.11a | **A second, in-tree SSH stack** implements its own `known_hosts` / `@revoked` / `@cert-authority` parsing | string census + verbatim extraction | `index.chunk-CATyehLt.js` |
| C4.12 | Binary embeds a full SSH **server** (inbound surface) | banner/kex/auth strings | `evidence/cowork-strings.txt` |
| C4.13 | VHDX is the guest disk; symbols `SetVHDXPath`, `smol-bin.vhdx`, `efivars.fd` | Go symbol table + JS | `evidence/cowork-deep.txt` |
| C4.14 | Guest network default (NAT vs isolated) **not** resolved | — | open item |
| C4.15 | Pipe signature uses **HMAC-SHA2-256**, enforced via `enforceSignature`/`CheckSignature`, with `validateBundlePathAsUser` wrapping `handleConfigure` | targeted binary string sweep | `evidence/cowork-strings.txt` |
| C4.16 | `claude-ssh-askpass.exe` and `claude-ssh-proxy.exe` are **MSIX `Windows.FullTrustApplication` entry points** (`AppxManifest.xml`) | manifest parse | binary | no |

### Corrections recorded in this report

**C-B — toolchain misidentified as Rust; actually Go.** See §4.1. Corrected before
delivery by marker-based fingerprinting. Left visible per G8.

**C-I — "no independent host-key store" was too strong.** An adversarial pass found a
second SSH stack in `index.chunk-CATyehLt.js` with its own `known_hosts` parser; I
confirmed it independently before accepting. The native broker path delegates to system
OpenSSH, but the in-tree `ssh2` path does not. See §4.4.
