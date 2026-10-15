$ErrorActionPreference = 'Continue'
$ex = 'C:\Users\AI-Howard\AppData\Local\Temp\rea-extracted-db115060-a4e6-4ddf-8c45-347ff113c0c6'
$t  = [System.IO.File]::ReadAllText("$ex\dist\main\index.js")

Write-Output '=== FACT-CHECK 1: tracesSampleRate — is it 1 or 0.01? ==='
foreach ($m in [regex]::Matches($t, 'tracesSampleRate.{0,40}')) {
  $s = [Math]::Max(0, $m.Index - 260)
  Write-Output ("  RAW >>> " + ($t.Substring($s, [Math]::Min(420, $t.Length - $s)) -replace '\s+', ' '))
  Write-Output ''
}
Write-Output '  exact tokens found:'
foreach ($tok in @("'tracesSampleRate':1", "'tracesSampleRate':0.01", "'tracesSampleRate':0x1", "'sampleRate':1", "'sampleRate':0x1")) {
  Write-Output ("    {0,-28} count = {1}" -f $tok, ([regex]::Matches($t, [regex]::Escape($tok))).Count)
}

Write-Output ''
Write-Output '=== FACT-CHECK 2: Set members — JS numbers or int32 aliases? ==='
$m = $t -match 'Bf\s*=\s*new Set\(\s*\[([^\]]*)\]'
if ($m) {
  $vals = $Matches[1].Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ }
  foreach ($v in $vals) {
    $asDouble = if ($v.StartsWith('0x')) { [Convert]::ToInt64($v, 16) } else { [int64]$v }
    $trunc32 = [int32]($asDouble -band 0xFFFFFFFFL)
    Write-Output ("    {0,-16} -> JS value {1,-14} int32-truncated {2} (hex 0x{3})" -f $v, $asDouble, $trunc32, ([uint32]($trunc32 -band 0xFFFFFFFFL)).ToString('X8'))
  }
  $jsNums = $vals | ForEach-Object { if ($_.StartsWith('0x')) { [Convert]::ToInt64($_, 16) } else { [int64]$_ } }
  Write-Output ("    distinct as raw JS numbers = {0}" -f (($jsNums | Sort-Object -Unique)).Count)
}

Write-Output ''
Write-Output '=== FACT-CHECK 3: the Sentry gauge metric + interval ==='
foreach ($m in [regex]::Matches($t, "metrics'\]\['gauge'\]\[?.{0,180}")) {
  $s = [Math]::Max(0, $m.Index - 60)
  Write-Output ("  >>> " + ($t.Substring($s, [Math]::Min(300, $t.Length - $s)) -replace '\s+', ' '))
}
Write-Output ''
Write-Output '=== FACT-CHECK 4: Mixpanel gating - does At require a user_id? ==='
$g = $t.IndexOf('user_id')
$hits = @()
$i = 0
while (($i = $t.IndexOf('user_id', $i)) -ge 0) { $hits += $i; $i++ }
Write-Output "  'user_id' literal occurrences in main = $($hits.Count)"
foreach ($h in ($hits | Select-Object -First 6)) {
  $s = [Math]::Max(0, $h - 220)
  Write-Output ("   @{0}: {1}" -f $h, ($t.Substring($s, [Math]::Min(340, $t.Length - $s)) -replace '\s+', ' '))
}