$ErrorActionPreference = 'Continue'
$ex = 'C:\Users\AI-Howard\AppData\Local\Temp\rea-extracted-db115060-a4e6-4ddf-8c45-347ff113c0c6'

foreach ($fn in @("$ex\dist\main\index.js", "$ex\dist\renderer\static\js\D1JFvEfK.mjs")) {
  if (-not (Test-Path $fn)) { Write-Output "MISSING $fn"; continue }
  $t = [System.IO.File]::ReadAllText($fn)
  Write-Output ""
  Write-Output "########## $fn ##########"
  foreach ($m in [regex]::Matches($t, 'focused-context')) {
    $s = [Math]::Max(0, $m.Index - 190)
    Write-Output ("  @{0}: {1}" -f $m.Index, ($t.Substring($s, [Math]::Min(300, $t.Length - $s)) -replace '\s+', ' '))
  }
}

Write-Output ""
Write-Output '=== all channel-like strings starting with focused-context (exact forms) ==='
$files = @(Get-ChildItem "$ex\dist" -Recurse -File | Where-Object { $_.Extension -in '.js', '.mjs' })
$hits = @()
foreach ($f in $files) {
  $t = [System.IO.File]::ReadAllText($f.FullName)
  foreach ($m in [regex]::Matches($t, 'focused-context:[A-Za-z0-9_:.-]+')) { $hits += $m.Value }
}
Write-Output ("  distinct = {0}" -f (($hits | Sort-Object -Unique) -join '  |  '))