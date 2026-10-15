$ErrorActionPreference = 'Continue'
$ex = 'C:\Users\AI-Howard\AppData\Local\Temp\rea-extracted-db115060-a4e6-4ddf-8c45-347ff113c0c6'
$t  = [System.IO.File]::ReadAllText("$ex\dist\main\index.js")

function N([string]$p) { return ([regex]::Matches($t, [regex]::Escape($p))).Count }

Write-Output '=== handler registration shapes ==='
$shapes = @('.on(', '.handle(', '.handleOnce(', ".['on'](", ".['handle'](", '.removeHandler(')
foreach ($s in $shapes) { Write-Output ("  {0,-18} = {1}" -f $s, (N $s)) }

Write-Output ''
Write-Output '=== ipcMain alias _0x488816: first 10 usage sites ==='
$n = 0
foreach ($m in [regex]::Matches($t, '_0x488816')) {
  $n++; if ($n -gt 10) { break }
  $s = [Math]::Max(0, $m.Index - 120)
  $frag = $t.Substring($s, [Math]::Min(260, $t.Length - $s)) -replace '\s+', ' '
  Write-Output "--- #$n @$($m.Index) ---"
  Write-Output "   $frag"
}

Write-Output ''
Write-Output '=== TRAP-1 CORRECTION: usage of decoded index 0x6d8 ("sender") ==='
Write-Output "  literal '.sender'      = $(N '.sender')"
$idx = 0
foreach ($m in [regex]::Matches($t, '0x6d8')) {
  $idx++
  $s = [Math]::Max(0, $m.Index - 150)
  $frag = $t.Substring($s, [Math]::Min(320, $t.Length - $s)) -replace '\s+', ' '
  Write-Output "--- 0x6d8 #$idx @$($m.Index) ---"
  Write-Output "   $frag"
}
Write-Output "  total 0x6d8 occurrences = $idx"

Write-Output ''
Write-Output '=== other decoded-string validation indices (0x888 channel, 0xa06 origin, 0x6e6 channels) ==='
foreach ($pair in @(@('0x888','channel'), @('0xa06','origin'), @('0x6e6','channels'))) {
  $c = ([regex]::Matches($t, [regex]::Escape($pair[0]))).Count
  Write-Output ("  {0,-8} ({1,-9}) = {2}" -f $pair[0], $pair[1], $c)
}