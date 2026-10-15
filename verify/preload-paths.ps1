$ErrorActionPreference = 'Continue'
$ex = 'C:\Users\AI-Howard\AppData\Local\Temp\rea-extracted-db115060-a4e6-4ddf-8c45-347ff113c0c6'
$ev = 'C:\Users\AI-Howard\.minimax\sessions\mvs_5da20d90a24148b885e5b9cf63ba7cc1\workspace\typeless\evidence'
$t  = [System.IO.File]::ReadAllText("$ex\dist\main\index.js")

Write-Output '=== decode the path-building indices from strings-main.txt ==='
foreach ($i in @('0x823','0x40b','0x1cf','0x29d','0x508','0x375')) {
  $line = Select-String -Path "$ev\strings-main.txt" -Pattern "^$i\t" | Select-Object -First 1
  if ($line) { Write-Output ("  {0,-8} = {1}" -f $i, ($line.Line -split "`t")[1]) } else { Write-Output "  $i = <not found>" }
}

Write-Output ''
Write-Output '=== where do the 6 preload vars get bound? ==='
foreach ($v in @('gp','mp','_p','qp','af','ly')) {
  Write-Output "--- preload var '$v' ---"
  $found = $false
  foreach ($m in [regex]::Matches($t, "(?:const|let|var)\s+_?$v\s*=")) {
    $s = [Math]::Max(0, $m.Index - 160)
    $frag = $t.Substring($s, [Math]::Min(320, $t.Length - $s)) -replace '\s+', ' '
    Write-Output "   @$($m.Index)  $frag"
    $found = $true
  }
  if (-not $found) { Write-Output "   (no 'const $v =' binding found - may be a function param or destructured)" }
}

Write-Output ''
Write-Output '=== the two base dirs: St and kn definitions ==='
foreach ($v in @('St','kn','Wi','qp','af','ly')) {
  foreach ($m in [regex]::Matches($t, "(?:const|let|var)\s+$v\s*=")) {
    $s = [Math]::Max(0, $m.Index - 60)
    $frag = $t.Substring($s, [Math]::Min(220, $t.Length - $s)) -replace '\s+', ' '
    Write-Output ("  {0,-4} @{1,-7} {2}" -f $v, $m.Index, $frag)
  }
}

Write-Output ''
Write-Output '=== count distinct window-option subclasses (index 0x1cf method) ==='
Write-Output "  0x1cf occurrences = $((([regex]::Matches($t,'0x1cf')).Count))"
Write-Output "  'class X extends ps' count = $((([regex]::Matches($t,'extends ps')).Count))"