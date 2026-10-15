$ErrorActionPreference = 'Continue'
$ex = 'C:\Users\AI-Howard\AppData\Local\Temp\rea-extracted-db115060-a4e6-4ddf-8c45-347ff113c0c6'
$ev = 'C:\Users\AI-Howard\.minimax\sessions\mvs_5da20d90a24148b885e5b9cf63ba7cc1\workspace\typeless\evidence'
$t  = [System.IO.File]::ReadAllText("$ex\dist\main\index.js")
$st = [System.IO.File]::ReadAllText("$ev\strings-main.txt")

Write-Output '=== locate key strings in the decoded table ==='
$idx = @{}
foreach ($kw in @('no-sandbox','commandLine','appendSwitch','disableHardwareAcceleration','disable-gpu','switch','removeSwitch','gpu')) {
  $line = ($st -split "`n") | Where-Object { $_ -match "`t$([regex]::Escape($kw))$" } | Select-Object -First 1
  if ($line) {
    $hex = ($line -split "`t")[0]
    $idx[$kw] = $hex
    Write-Output ("  {0,-28} -> index {1}" -f $kw, $hex)
  } else { Write-Output ("  {0,-28} -> NOT in decoded table" -f $kw) }
}

Write-Output ''
Write-Output '=== is no-sandbox actually USED at a call site? ==='
if ($idx.ContainsKey('no-sandbox')) {
  $h = $idx['no-sandbox']
  $rx = "(?<![\w$])$h(?![\w])"
  $hits = [regex]::Matches($t, $rx)
  Write-Output "  index $h literal uses = $($hits.Count)"
  foreach ($m in $hits) {
    $s = [Math]::Max(0, $m.Index - 260)
    Write-Output ("   @{0}: {1}" -f $m.Index, ($t.Substring($s, [Math]::Min(400, $t.Length - $s)) -replace '\s+', ' '))
  }
}

Write-Output ''
Write-Output '=== commandLine / appendSwitch call sites ==='
foreach ($kw in @('commandLine','appendSwitch','removeSwitch')) {
  if ($idx.ContainsKey($kw)) {
    $h = $idx[$kw]
    $rx = "(?<![\w$])$h(?![\w])"
    $hits = [regex]::Matches($t, $rx)
    Write-Output "  $kw (index $h) uses = $($hits.Count)"
    $k = 0
    foreach ($m in $hits) {
      $k++; if ($k -gt 4) { break }
      $s = [Math]::Max(0, $m.Index - 200)
      Write-Output ("   @{0}: {1}" -f $m.Index, ($t.Substring($s, [Math]::Min(320, $t.Length - $s)) -replace '\s+', ' '))
    }
  }
}

Write-Output ''
Write-Output '=== disableHardwareAcceleration usage ==='
if ($idx.ContainsKey('disableHardwareAcceleration')) {
  $h = $idx['disableHardwareAcceleration']
  $hits = [regex]::Matches($t, "(?<![\w$])$h(?![\w])")
  Write-Output "  uses = $($hits.Count)"
  foreach ($m in $hits) {
    $s = [Math]::Max(0, $m.Index - 200)
    Write-Output ("   @{0}: {1}" -f $m.Index, ($t.Substring($s, [Math]::Min(320, $t.Length - $s)) -replace '\s+', ' '))
  }
}