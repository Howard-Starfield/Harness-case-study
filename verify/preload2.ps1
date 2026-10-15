$ErrorActionPreference = 'Continue'
$ex = 'C:\Users\AI-Howard\AppData\Local\Temp\rea-extracted-db115060-a4e6-4ddf-8c45-347ff113c0c6'
$t  = [System.IO.File]::ReadAllText("$ex\dist\main\index.js")

Write-Output '=== resolve preload vars qp, af, ly, _p, mp (word-boundary, allow multi-declarator) ==='
foreach ($v in @('mp','_p','qp','af','ly','gp')) {
  $esc = [regex]::Escape($v)
  # match  <v>=  not preceded by a word char and not part of a longer identifier
  $rx = "(?<![\w$])$esc\s*="
  $hits = [regex]::Matches($t, $rx)
  Write-Output "--- '$v' : $($hits.Count) assignment site(s) ---"
  foreach ($m in $hits) {
    $s = [Math]::Max(0, $m.Index - 200)
    $frag = $t.Substring($s, [Math]::Min(300, $t.Length - $s)) -replace '\s+', ' '
    Write-Output "   @$($m.Index)  $frag"
  }
}

Write-Output ''
Write-Output '=== every distinct preload path expression in main (join(...0x823) style) ==='
Write-Output "  occurrences of '0x823' (= ../preload/index.mjs) = $((([regex]::Matches($t,'0x823')).Count))"
foreach ($m in [regex]::Matches($t, '0x823')) {
  $s = [Math]::Max(0, $m.Index - 170)
  $frag = $t.Substring($s, [Math]::Min(260, $t.Length - $s)) -replace '\s+', ' '
  Write-Output "   @$($m.Index)  $frag"
}

Write-Output ''
Write-Output '=== any OTHER preload path literal? ==='
foreach ($p in @('preload/index', 'index.mjs', '.preload', 'preload')) {
  Write-Output ("  '{0,-16}' = {1}" -f $p, ([regex]::Matches($t, [regex]::Escape($p))).Count)
}
foreach ($m in [regex]::Matches($t, 'preload/index')) {
  $s = [Math]::Max(0, $m.Index - 170)
  Write-Output ("   @" + $m.Index + "  " + ($t.Substring($s, [Math]::Min(260, $t.Length - $s)) -replace '\s+', ' '))
}

Write-Output ''
Write-Output '=== the 6 window subclasses and their getWindowOptions ==='
foreach ($m in [regex]::Matches($t, 'class\s+([A-Za-z_$][\w$]*)\s+extends\s+ps')) {
  Write-Output ("  class {0} extends ps   @{1}" -f $m.Groups[1].Value, $m.Index)
}