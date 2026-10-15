$ErrorActionPreference = 'Continue'
$ex = 'C:\Users\AI-Howard\AppData\Local\Temp\rea-extracted-db115060-a4e6-4ddf-8c45-347ff113c0c6'
$t  = [System.IO.File]::ReadAllText("$ex\dist\main\index.js")

Write-Output '=== locate the app-settings electron-store construction ==='
foreach ($m in [regex]::Matches($t, "new _0x24b501\(\{")) {
  $s = [Math]::Max(0, $m.Index - 120)
  $frag = $t.Substring($s, [Math]::Min(340, $t.Length - $s)) -replace '\s+', ' '
  Write-Output ("  @{0}: {1}" -f $m.Index, $frag)
}

Write-Output ''
Write-Output '=== brace-matched walk of the schema object for app-settings ==='
# find 'app-settings' literal
$idxs = @()
$i = 0
while (($i = $t.IndexOf("app-settings", $i)) -ge 0) { $idxs += $i; $i++ }
Write-Output "  'app-settings' literal occurrences: $($idxs.Count)"
foreach ($i in $idxs) {
  $s = [Math]::Max(0, $i - 200)
  Write-Output ("   @{0}: {1}" -f $i, ($t.Substring($s, [Math]::Min(420, $t.Length - $s)) -replace '\s+', ' '))
}