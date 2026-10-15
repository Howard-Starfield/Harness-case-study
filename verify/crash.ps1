$ErrorActionPreference = 'Continue'
$ev = 'C:\Users\AI-Howard\.minimax\sessions\mvs_5da20d90a24148b885e5b9cf63ba7cc1\workspace\typeless\evidence'
$ex = 'C:\Users\AI-Howard\AppData\Local\Temp\rea-extracted-db115060-a4e6-4ddf-8c45-347ff113c0c6'
$st = [System.IO.File]::ReadAllText("$ev\strings-main.txt")
$t  = [System.IO.File]::ReadAllText("$ex\dist\main\index.js")

Write-Output '=== decode the GPU-crash chain indices ==='
foreach ($h in @('0xa05','0xac6','0xadc','0x31c','0x4aa','0x3f9','0x5dc','0x84e','0x930','0x48d','0x536','0x708')) {
  $line = ($st -split "`n") | Where-Object { $_ -match "^$h\t" } | Select-Object -First 1
  $val = if ($line) { ($line -split "`t")[1] } else { '<not found>' }
  Write-Output ("  {0,-8} = {1}" -f $h, $val)
}

Write-Output ''
Write-Output '=== the exit-code set, decoded ==='
$neg = -0x3ffffecb
$pos = 0xc0000135
Write-Output ("  -0x3ffffecb  as int32 signed = {0}" -f $neg)
Write-Output ("  0xc0000135   as int32 signed = {0}" -f ([int32]([uint32]0xc0000135)))
Write-Output ("  -0x3ffffecb as uint32      = 0x{0:X8}" -f ([uint32]([int64]$neg -band 0xFFFFFFFF)))
Write-Output ("  0xc0000135  as uint32       = 0x{0:X8}" -f $pos)
Write-Output "  NTSTATUS reference: 0xC0000135 = STATUS_DEVICE_REMOVED? (0xC0000141 = STATUS_DEVICE_REMOVED)"

Write-Output ''
Write-Output '=== full child-process-gone handler, verbatim ==='
$s = [Math]::Max(0, 431020 - 900)
Write-Output ($t.Substring($s, 2100) -replace '\s+', ' ')

Write-Output ''
Write-Output '=== where is s_() invoked (startup order)? ==='
$k = 0
foreach ($m in [regex]::Matches($t, '(?<![\w$])s_(?![\w])')) {
  $k++; if ($k -gt 6) { break }
  $ss = [Math]::Max(0, $m.Index - 160)
  Write-Output ("   @{0}: {1}" -f $m.Index, ($t.Substring($ss, [Math]::Min(280, $t.Length - $ss)) -replace '\s+', ' '))
}