$ErrorActionPreference = 'Continue'
$root = 'C:\Program Files\WindowsApps\OpenAI.Codex_26.1007.2314.0_x64__2p2nqsd0c76g0'

$targets = @()
foreach ($n in @('app\Codex.exe','app\ChatGPT.exe','app\elevation_service.exe','app\elevated_tracing_service.exe',
                 'app\chrome.dll','app\chrome_elf.dll',
                 'app\resources\codex.exe','app\resources\codex',
                 'app\resources\codex-code-mode-host.exe','app\resources\codex-code-mode-host',
                 'app\resources\codex-windows-sandbox-service.exe','app\resources\codex-windows-sandbox-setup.exe',
                 'app\resources\codex-command-runner.exe','app\resources\rg.exe','app\resources\rg')) {
  $p = Join-Path $root $n
  if (Test-Path $p) { $targets += $p }
}

"=== CODEX SIGNATURE POSTURE ==="
"checked: $($targets.Count) binaries"
""
"{0,-46} {1,-9} {2,-7} {3}" -f 'BINARY','STATUS','TIMES','SUBJECT'
"-" * 118

foreach ($p in $targets) {
  $rel = $p.Replace($root + '\','')
  try {
    $s = Get-AuthenticodeSignature -FilePath $p
    $subj = ''
    if ($s.SignerCertificate) { $subj = $s.SignerCertificate.Subject }
    $ts = 'n/a'
    if ($s.TimeStamperCertificate) { $ts = $s.TimeStamperCertificate.Subject }
    $subjShort = if ($subj.Length -gt 40) { $subj.Substring(0,40) + '...' } else { $subj }
    $tsShort = if ($ts.Length -gt 30) { $ts.Substring(0,30) + '...' } else { $ts }
    "{0,-46} {1,-9} {2,-7} {3}" -f $rel, $s.Status, $s.StatusMessage.Length, $subjShort
    "    timestamp: $tsShort"
    if ($s.SignerCertificate) {
      $c = $s.SignerCertificate
      "    issuer   : $($c.Issuer)"
      "    notAfter : $($c.NotAfter)   thumbprint: $($c.Thumbprint)"
      "    sig alg  : $($c.SignatureAlgorithm.FriendlyName)"
    }
  } catch {
    "{0,-46} {1}" -f $rel, "ERROR: $($_.Exception.Message)"
  }
  ""
}

"=== MSIX PACKAGE IDENTITY ==="
try {
  $pkg = Get-AppxPackage -Name '*Codex*' -ErrorAction SilentlyContinue
  if ($pkg) {
    "Name          : $($pkg.Name)"
    "Version       : $($pkg.Version)"
    "Publisher     : $($pkg.Publisher)"
    "PackageFull   : $($pkg.PackageFullName)"
    "InstallLoc    : $($pkg.InstallLocation)"
    "SignatureKind : $($pkg.SignatureKind)"
    "Status        : $($pkg.Status)"
  } else { "(Get-AppxPackage returned nothing)" }
} catch { "(appx query unavailable: $($_.Exception.Message))" }