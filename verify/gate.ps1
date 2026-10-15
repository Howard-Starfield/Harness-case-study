$ErrorActionPreference = 'Continue'
$ev = 'C:\Users\AI-Howard\.minimax\sessions\mvs_5da20d90a24148b885e5b9cf63ba7cc1\workspace\typeless\evidence'
$ex = 'C:\Users\AI-Howard\AppData\Local\Temp\rea-extracted-db115060-a4e6-4ddf-8c45-347ff113c0c6'
$st = [System.IO.File]::ReadAllText("$ev\strings-main.txt")
$t  = [System.IO.File]::ReadAllText("$ex\dist\main\index.js")

Write-Output '=== decode the gating indices ==='
foreach ($h in @('0x282','0x708','0x649','0x3b3','0xc32','0x299','0x8de','0x2c4','0x52b','0x536','0xc64','0x429')) {
  $line = ($st -split "`n") | Where-Object { $_ -match "^$h\t" } | Select-Object -First 1
  $val = if ($line) { ($line -split "`t")[1] } else { '<not found>' }
  Write-Output ("  {0,-8} = {1}" -f $h, $val)
}

Write-Output ''
Write-Output '=== wider context around the no-sandbox gate (@630042) ==='
$s = [Math]::Max(0, 630042 - 900)
Write-Output ($t.Substring($s, 1500) -replace '\s+', ' ')

Write-Output ''
Write-Output '=== every use of the flag getter index 0x708 (what is N?) ==='
$k = 0
foreach ($m in [regex]::Matches($t, '(?<![\w$])0x708(?![\w])')) {
  $k++; if ($k -gt 8) { break }
  $ss = [Math]::Max(0, $m.Index - 130)
  Write-Output ("   @{0}: {1}" -f $m.Index, ($t.Substring($ss, [Math]::Min(240, $t.Length - $ss)) -replace '\s+', ' '))
}
Write-Output "  total 0x708 uses = $k+"