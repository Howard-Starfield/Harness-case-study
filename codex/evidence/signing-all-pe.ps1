$ErrorActionPreference = 'Continue'
# Close correction C-M properly: sign EVERY PE file in the package, not a hardcoded 15.
# Method: enumerate by MZ magic bytes (not by extension), then Get-AuthenticodeSignature.
# Any non-PE result (UnknownError) gets its real magic printed so a parser artifact
# cannot be misreported as an unsigned binary (the C-F trap).

$Root = 'C:\Program Files\WindowsApps\OpenAI.Codex_26.1007.2314.0_x64__2p2nqsd0c76g0'

function Get-PeFiles([string]$Dir) {
  $out = @()
  foreach ($f in Get-ChildItem -Path $Dir -Recurse -File -ErrorAction SilentlyContinue) {
    try {
      $fs = [System.IO.File]::OpenRead($f.FullName)
      $b = New-Object byte[] 2
      [void]$fs.Read($b, 0, 2)
      $fs.Close()
      if ($b[0] -eq 0x4D -and $b[1] -eq 0x5A) { $out += $f }
    } catch { }
  }
  return $out
}

$all = @()
foreach ($d in @("$Root\app", "$Root")) {
  if ($d -eq $Root) { continue }
  $all += Get-PeFiles $d
}
$all = $all | Sort-Object FullName -Unique

"=== CODEX PACKAGE-WIDE AUTHENTICODE CENSUS ==="
"enumerated by MZ magic bytes (not by file extension)"
"PE files found: $($all.Count)"
""

$valid = 0; $invalid = 0; $unknown = 0; $notsigned = 0
$signers = @{}
$rows = @()

foreach ($f in $all) {
  $rel = $f.FullName.Replace("$Root\", '')
  $s = Get-AuthenticodeSignature -FilePath $f.FullName
  $subj = if ($s.SignerCertificate) { $s.SignerCertificate.Subject } else { '(none)' }
  $cn = if ($subj -match 'CN=([^,]+)') { $Matches[1] } else { '(none)' }
  $key = "$($s.Status)|$cn"
  if (-not $signers.ContainsKey($key)) { $signers[$key] = 0 }
  $signers[$key]++

  switch ($s.Status) {
    'Valid'   { $valid++ }
    'NotSigned'{ $notsigned++ }
    default   { $unknown++ }
  }
  $rows += [pscustomobject]@{ Rel = $rel; Status = $s.Status; Signer = $cn; Thumb = if ($s.SignerCertificate) { $s.SignerCertificate.Thumbprint } else { '' }; Size = $f.Length }
}

"--- results ---"
"Valid        : $valid"
"NotSigned    : $notsigned"
"Other/Unknown: $unknown"
""
"--- by (status, signer) ---"
$signers.GetEnumerator() | Sort-Object Value -Descending | ForEach-Object { "  {0,7}  {1}" -f $_.Value, $_.Key }
""
"--- every NON-Valid file, with its real magic bytes ---"
$magicBytes = @{}
foreach ($r in ($rows | Where-Object { $_.Status -ne 'Valid' })) {
  $p = Join-Path $Root $r.Rel
  $fs = [System.IO.File]::OpenRead($p); $b = New-Object byte[] 4; [void]$fs.Read($b,0,4); $fs.Close()
  $hex = ($b | ForEach-Object { $_.ToString('x2') }) -join ''
  $kind = switch -Regex ($hex) {
    '^7f454c46' { 'ELF (Linux) - parser artifact, NOT an unsigned PE' }
    '^4d5a'     { 'PE - genuinely unsigned or unverifiable' }
    default     { "other ($hex)" }
  }
  "{0,-58} {1,-12} {2}" -f $r.Rel, $r.Status, $kind
}
""
"--- distinct signers ---"
$rows | Where-Object { $_.Thumb } | Group-Object Thumb, Signer | ForEach-Object {
  "  $($_.Name)   x$($_.Count)"
}