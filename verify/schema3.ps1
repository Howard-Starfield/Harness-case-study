$ErrorActionPreference = 'Continue'
$ex = 'C:\Users\AI-Howard\AppData\Local\Temp\rea-extracted-db115060-a4e6-4ddf-8c45-347ff113c0c6'
$t  = [System.IO.File]::ReadAllText("$ex\dist\main\index.js")

$start = $t.IndexOf("'name':'app-settings'", 186000)
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

Write-Output '################ FULL app-settings SCHEMA (pretty-printed one key per line) ################'
$pretty = $schema -replace ",'", ",`n   '"
$pretty = $pretty -replace '\},\{', "}, {`n   "
Write-Output $pretty
Write-Output ''
Write-Output '################ key count via regex ################'
$keys = [regex]::Matches($schema, "'([A-Za-z_][A-Za-z0-9_]*)'\s*:\s*\{") | ForEach-Object { $_.Groups[1].Value }
Write-Output "  keys with an object value (depth-1 entries look like this): $($keys.Count)"
$keys | ForEach-Object { Write-Output "    - $_" }
Write-Output ''
Write-Output '################ gpuSandboxDisabled context inside schema ################'
$g = $schema.IndexOf('gpuSandboxDisabled')
if ($g -ge 0) {
  $s = [Math]::Max(0, $g - 90)
  Write-Output ('  ...' + ($schema.Substring($s, [Math]::Min(240, $schema.Length - $s)) -replace '\s+', ' ') + '...')
}