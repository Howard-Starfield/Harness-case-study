$ErrorActionPreference = 'Continue'
$ex = 'C:\Users\AI-Howard\AppData\Local\Temp\rea-extracted-db115060-a4e6-4ddf-8c45-347ff113c0c6'

Write-Output '############ PRELOAD: dist\preload\index.mjs ############'
$pre = [System.IO.File]::ReadAllText("$ex\dist\preload\index.mjs")
Write-Output "length = $($pre.Length)"
Write-Output ''
Write-Output '--- FULL CONTENT (11 KB, readable, single file) ---'
Write-Output $pre
Write-Output ''
Write-Output '--- targeted counts ---'
foreach ($p in @('ipcRenderer', 'contextBridge', 'exposeInMainWorld', 'electron', 'invoke', 'send', 'on(', 'sendSync', 'process.versions')) {
  Write-Output ("  {0,-20} = {1}" -f $p, ([regex]::Matches($pre, [regex]::Escape($p))).Count)
}

Write-Output ''
Write-Output '############ WINDOW ENUMERATION (main) ############'
$t = [System.IO.File]::ReadAllText("$ex\dist\main\index.js")
Write-Output '--- each webPreferences code site: preceding method + preload value ---'
$n = 0
foreach ($m in [regex]::Matches($t, 'webPreferences')) {
  $n++
  $s = [Math]::Max(0, $m.Index - 420)
  $frag = $t.Substring($s, [Math]::Min(620, $t.Length - $s)) -replace '\s+', ' '
  Write-Output ""
  Write-Output "===== site #$n @ $($m.Index) ====="
  Write-Output $frag
}

Write-Output ''
Write-Output '--- central constructor context (site 2) ---'
$s = [Math]::Max(0, 192481 - 1200)
Write-Output ($t.Substring($s, 2000) -replace '\s+', ' ')