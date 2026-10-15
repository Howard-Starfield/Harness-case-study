$ErrorActionPreference = 'Continue'
$ex = 'C:\Users\AI-Howard\AppData\Local\Temp\rea-extracted-db115060-a4e6-4ddf-8c45-347ff113c0c6'
$t  = [System.IO.File]::ReadAllText("$ex\dist\main\index.js")

Write-Output '=== all 3 gpuSandboxDisabled (index 0x649) occurrences in main ==='
$k = 0
foreach ($m in [regex]::Matches($t, '(?<![\w$])0x649(?![\w])')) {
  $k++
  $s = [Math]::Max(0, $m.Index - 420)
  $len = [Math]::Min(700, $t.Length - $s)
  Write-Output ""
  Write-Output "########## occurrence #$k @ $($m.Index) ##########"
  Write-Output ($t.Substring($s, $len) -replace '\s+', ' ')
}

Write-Output ''
Write-Output '=== does anything WRITE gpuSandboxDisabled? (store set) ==='
Write-Output "  N['set'] adjacent to 0x649? searching 0x649 within 200 chars of a 'set(' pattern"
foreach ($m in [regex]::Matches($t, '(?<![\w$])0x649(?![\w])')) {
  $s = [Math]::Max(0, $m.Index - 200); $e = [Math]::Min($t.Length, $m.Index + 200)
  $win = $t.Substring($s, $e - $s)
  $hasSet = ($win -match "\['set'\]") -or ($win -match '\[0x536\]')
  Write-Output ("   @{0}: nearby-set-token = {1}" -f $m.Index, $hasSet)
}

Write-Output ''
Write-Output '=== env vars that could reach it (TYPELESS_/process.env) ==='
foreach ($m in [regex]::Matches($t, "process\['env'\]\['[A-Z_]+'\]")) {
  Write-Output ("   " + $m.Value)
}
$envs = [regex]::Matches($t, "process\['env'\]\[[^\]]+\]") | ForEach-Object { $_.Value } | Sort-Object -Unique
Write-Output "  total distinct env reads = $($envs.Count)"
$envs | Select-Object -First 25 | ForEach-Object { Write-Output ("   " + $_) }