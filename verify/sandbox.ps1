$ErrorActionPreference = 'Continue'
$ex = 'C:\Users\AI-Howard\AppData\Local\Temp\rea-extracted-db115060-a4e6-4ddf-8c45-347ff113c0c6'
$t  = [System.IO.File]::ReadAllText("$ex\dist\main\index.js")

Write-Output '=== the ONE sandbox hit in main/index.js ==='
foreach ($m in [regex]::Matches($t, 'sandbox')) {
  $s = [Math]::Max(0, $m.Index - 220)
  Write-Output ("  @{0}: {1}" -f $m.Index, ($t.Substring($s, [Math]::Min(340, $t.Length - $s)) -replace '\s+', ' '))
}

Write-Output ''
Write-Output '=== renderer chunk sandbox hits (iframe sandbox vs electron?) ==='
foreach ($f in (Get-ChildItem "$ex\dist\renderer" -Recurse -File | Where-Object { $_.Extension -in '.js','.mjs' })) {
  $c = [System.IO.File]::ReadAllText($f.FullName)
  $n = ([regex]::Matches($c, 'sandbox')).Count
  if ($n -gt 0) {
    Write-Output "--- $($f.Name): $n ---"
    $k = 0
    foreach ($m in [regex]::Matches($c, 'sandbox')) {
      $k++; if ($k -gt 3) { break }
      $s = [Math]::Max(0, $m.Index - 110)
      Write-Output ("    @{0}: {1}" -f $m.Index, ($c.Substring($s, [Math]::Min(200, $c.Length - $s)) -replace '\s+', ' '))
    }
  }
}

Write-Output ''
Write-Output '=== is the Electron/Chromium version resolvable after all? ==='
foreach ($p in @('electronVersion', 'process.versions.electron', 'app.getVersion', 'electron/', 'chrome/', '--no-sandbox', 'app.commandLine.appendSwitch')) {
  Write-Output ("  {0,-32} = {1}" -f $p, ([regex]::Matches($t, [regex]::Escape($p))).Count)
}
Write-Output '  -- electron version hints in package.json / app files --'
$pj = [System.IO.File]::ReadAllText("$ex\package.json")
Write-Output "  package.json electron dep: $(([regex]::Matches($pj, '\"electron[^\"]*\"\s*:\s*\"[^\"]+\"')).Value -join ', ')"
foreach ($m in [regex]::Matches($pj, '"(electron|electronVersion|name|version)"\s*:\s*"[^"]*"')) {
  Write-Output ("    " + $m.Value)
}
$ele = Join-Path 'C:\Users\AI-Howard\AppData\Local\Programs\Typeless' 'version'
if (Test-Path $ele) { Write-Output '  -- version file --'; Get-Content $ele }