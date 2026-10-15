$ErrorActionPreference = 'Continue'
$ex = 'C:\Users\AI-Howard\AppData\Local\Temp\rea-extracted-db115060-a4e6-4ddf-8c45-347ff113c0c6'
$t  = [System.IO.File]::ReadAllText("$ex\dist\main\index.js")

Write-Output '=== every top-level binding of N ==='
foreach ($m in [regex]::Matches($t, '(?:^|[;,{])\s*(?:const|let|var)\s+N\s*=')) {
  $s = [Math]::Max(0, $m.Index - 60)
  Write-Output ("  @{0}: {1}" -f $m.Index, ($t.Substring($s, [Math]::Min(260, $t.Length - $s)) -replace '\s+', ' '))
}
Write-Output "  total 'const/let/var N =' bindings = $((([regex]::Matches($t,'(?:const|let|var)\s+N\s*='))).Count)"

Write-Output ''
Write-Output '=== is N the app-settings store? full constructor at 186477 ==='
$s = 186477
Write-Output ($t.Substring($s, 260) -replace '\s+', ' ')

Write-Output ''
Write-Output '=== brace-matched extraction of app-settings schema + top-level key count ==='
$start = $t.IndexOf("'name':'app-settings'", 186000)
Write-Output "  'name':'app-settings' at $start"
$schStart = $t.IndexOf("'schema':{", $start)
$i = $t.IndexOf('{', $schStart)
$depth = 0; $instr = $null; $esc = $false; $end = -1
for ($j = $i; $j -lt $t.Length; $j++) {
  $c = $t[$j]
  if ($esc) { $esc = $false; continue }
  if ($c -eq '\') { $esc = $true; continue }
  if ($instr) { if ($c -eq $instr) { $instr = $null }; continue }
  if ($c -eq '"' -or $c -eq "'" -or $c -eq '`') { $instr = $c; continue }
  if ($c -eq '{') { $depth++ }
  elseif ($c -eq '}') { $depth--; if ($depth -eq 0) { $end = $j; break } }
}
$schema = $t.Substring($i, $end - $i + 1)
Write-Output "  schema length = $($schema.Length) chars"
# count depth-1 keys
$keys = @(); $d = 0; $instr = $null; $esc = $false; $buf = ''
for ($j = 1; $j -lt $schema.Length; $j++) {
  $c = $schema[$j]
  if ($esc) { $esc = $false; $buf += $c; continue }
  if ($c -eq '\') { $esc = $true; $buf += $c; continue }
  if ($instr) { if ($c -eq $instr) { $instr = $null }; $buf += $c; continue }
  if ($c -eq '"' -or $c -eq "'") { $instr = $c; $buf += $c; continue }
  if ($c -eq '{' -or $c -eq '[') { $d++ }
  if ($c -eq '}' -or $c -eq ']') { $d-- }
  if ($c -eq ':' -and $d -eq 0) {
    $k = ($buf -replace ".*'", '' -replace "^\s*'", '').Trim()
    if ($k) { $keys += $k }
    $buf = ''
    continue
  }
  if ($c -eq ',') { $buf = ''; continue }
  $buf += $c
}
Write-Output "  TOP-LEVEL SCHEMA KEYS = $($keys.Count)"
$keys | ForEach-Object { Write-Output "    - $_" }
Write-Output ''
Write-Output '=== any privacy/telemetry-ish key? ==='
$hit = $keys | Where-Object { $_ -match 'privacy|telemetry|analytics|consent|track|pii|cloud_sync|diagnos|opt' }
Write-Output "  matches = $($hit.Count) [$($hit -join ', ')]"
Write-Output ''
Write-Output '=== does the schema mention gpuSandboxDisabled anywhere? ==='
Write-Output "  in schema = $($schema.Contains('gpuSandboxDisabled'))"
Write-Output "  anywhere in main = $((([regex]::Matches($t,'gpuSandboxDisabled')).Count))"