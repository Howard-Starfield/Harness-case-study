$ErrorActionPreference = 'Continue'
# The JS layer can only REQUEST a sandbox. The enforcement is in codex.exe (Rust, 334 MB).
# Extract printable strings relevant to policy enforcement and path confinement.
$Exe = 'C:\Program Files\WindowsApps\OpenAI.Codex_26.1007.2314.0_x64__2p2nqsd0c76g0\app\resources\codex.exe'

$bytes = [System.IO.File]::ReadAllBytes($Exe)
$ascii = [System.Text.Encoding]::ASCII.GetString($bytes)
$utf16 = [System.Text.Encoding]::Unicode.GetString($bytes)

"=== codex.exe : $($bytes.Length.ToString('N0')) bytes ==="

function Show-Matches([string]$label, [string[]]$patterns, [string]$corpus, [string]$name) {
  "`n--- $label ---"
  foreach ($p in $patterns) {
    $m = [regex]::Matches($corpus, $p, 'IgnoreCase')
    if ($m.Count -eq 0) { "  [0] $p" }
    else {
      $samples = @()
      foreach ($x in ($m | Select-Object -First 3)) {
        $s = [Math]::Max(0, $x.Index - 70)
        $len = [Math]::Min(190, $corpus.Length - $s)
        $frag = $corpus.Substring($s, $len) -replace '[^\x20-\x7e]', '.'
        $samples += $frag
      }
      "  [$($m.Count)] $p"
      foreach ($s in $samples) { "        ... $s ..." }
    }
  }
}

Show-Matches 'APPROVAL / POLICY' @(
  'execpolicy', 'exec_policy', 'ExecPolicy', 'approval_policy', 'approvalPolicy',
  'AskForApproval', 'sandbox_mode', 'SandboxMode', 'danger-full-access',
  'workspace-write', 'read-only', 'on-request', 'on-failure', 'never',
  'untrusted', 'auto-approv\w*', 'AutoApprove\w*'
) $ascii 'ascii'

Show-Matches 'SANDBOX / CONFINEMENT' @(
  'writable_roots', 'writableRoots', 'writable root', 'readable_roots',
  'sandbox.{0,12}(?:policy|mode|path|root)', 'windows-sandbox', 'WinSandbox',
  'AppContainer', 'restricted token', 'CreateRestrictedToken', 'LowIntegrity',
  'deny', 'DenyAcl', 'allow.{0,10}list', 'AllowList', 'AllowList'
) $ascii 'ascii'

Show-Matches 'PATH CONTAINMENT' @(
  'canonicaliz\w+', 'path traversal', '\.\.[\\/]', 'symlink', 'junction',
  'is_within', 'starts_with', 'normalize_path', 'PathBuf::'
) $ascii 'ascii'

Show-Matches 'APPROVAL GATE / ASK' @(
  'request_approval', 'requestApproval', 'pending_approval', 'PendingApproval',
  'await.{0,20}approval', 'approval.{0,15}timeout', 'escalat\w+'
) $ascii 'ascii'