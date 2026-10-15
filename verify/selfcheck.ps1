$ErrorActionPreference = 'Continue'
$ex = 'C:\Users\AI-Howard\AppData\Local\Temp\rea-extracted-db115060-a4e6-4ddf-8c45-347ff113c0c6'
$res = @()

function Count-Text([string]$path, [string]$pattern) {
  $t = [System.IO.File]::ReadAllText($path)
  return ([regex]::Matches($t, $pattern)).Count
}

function Count-Bytes([string]$path, [string]$ascii) {
  $b = [System.IO.File]::ReadAllBytes($path)
  $s = [System.Text.Encoding]::GetEncoding(28591).GetString($b)
  $c = 0; $i = 0
  while (($i = $s.IndexOf($ascii, $i, [System.StringComparison]::Ordinal)) -ge 0) { $c++; $i += $ascii.Length }
  return $c
}

$js = @(Get-ChildItem "$ex\dist" -Recurse -File | Where-Object { $_.Extension -in '.js', '.mjs', '.html', '.json', '.css' })

Write-Output "=== CHECK 1-3: Electron webPreferences (main bundle is single-line; count occurrences) ==="
foreach ($p in @('webPreferences', 'nodeIntegration', 'sandbox')) {
  $tot = 0; $per = @()
  foreach ($f in $js) {
    $n = Count-Text $f.FullName ([regex]::Escape($p))
    if ($n -gt 0) { $tot += $n; $per += ("{0}={1}" -f $f.Name, $n) }
  }
  Write-Output ("{0,-20} dist total = {1}   [{2}]" -f $p, $tot, ($per -join ' '))
  $res += [pscustomobject]@{ Check = $p; Expected = 'see brief'; Actual = $tot }
}
Write-Output ""
Write-Output "-- explicit quoted-key forms in main bundle --"
foreach ($p in @('"nodeIntegration":', "'nodeIntegration':", '"sandbox":', "'sandbox':", '"contextIsolation":', "'contextIsolation':", '"webSecurity":')) {
  $n = Count-Text "$ex\dist\main\index.js" ([regex]::Escape($p))
  Write-Output ("  main {0,-24} = {1}" -f $p, $n)
}

Write-Output ""
Write-Output "=== CHECK 9-11: winax / getUserMedia / MediaRecorder ==="
$winax = 0; foreach ($f in $js) { $winax += Count-Text $f.FullName 'winax' }
Write-Output "  winax in dist/*.{js,mjs,html,json,css} = $winax"
$pkg = Count-Text "$ex\package.json" 'winax'
Write-Output "  winax in package.json                  = $pkg"
$gum = @(); $mr = @()
foreach ($f in (Get-ChildItem "$ex\dist\renderer" -Recurse -File -ErrorAction SilentlyContinue)) {
  $a = Count-Text $f.FullName 'getUserMedia'; if ($a -gt 0) { $gum += "$($f.Name)=$a" }
  $b = Count-Text $f.FullName 'MediaRecorder'; if ($b -gt 0) { $mr += "$($f.Name)=$b" }
}
Write-Output "  getUserMedia in renderer   = $($gum.Count) files [$($gum -join ' ')]"
Write-Output "  MediaRecorder in renderer  = $($mr.Count) files [$($mr -join ' ')]"

Write-Output ""
Write-Output "=== CHECK 13: renderer BrowserWindow count (main bundle) ==="
foreach ($p in @('new F.BrowserWindow', 'new BrowserWindow', 'F.BrowserWindow(', 'BrowserWindow(')) {
  $n = Count-Text "$ex\dist\main\index.js" ([regex]::Escape($p))
  Write-Output ("  main {0,-26} = {1}" -f $p, $n)
}
$wins = Count-Text "$ex\dist\main\index.js" 'webPreferences'
Write-Output "  webPreferences occurrences in main = $wins  (expected 8 code sites + 1 string-array entry)"

Write-Output ""
Write-Output "=== CHECK 7: drizzle tables + migrations ==="
$dz = 'C:\Users\AI-Howard\AppData\Local\Programs\Typeless\resources\drizzle'
$mig = @(Get-ChildItem $dz -File -Filter *.sql)
Write-Output "  migration files = $($mig.Count)  (expected 14)"
$allsql = ($mig | ForEach-Object { [System.IO.File]::ReadAllText($_.FullName) }) -join "`n"
foreach ($t in @('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS')) {
  $n = ([regex]::Matches($allsql, [regex]::Escape($t))).Count
  Write-Output "  '$t' = $n"
}
$tbl = [regex]::Matches($allsql, '(?i)CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+["'']?([A-Za-z_][A-Za-z0-9_]*)') | ForEach-Object { $_.Groups[1].Value }
Write-Output "  distinct table names = $(($tbl | Sort-Object -Unique) -join ', ')"

Write-Output ""
Write-Output "=== CHECK 1 (ASR absence): ASR runtime + model asset sweep across whole extract ==="
$asr = @('onnxruntime', 'sherpa', 'vosk', 'whisper.cpp', 'faster-whisper', 'SpeechRecognition', 'speech_recognition', 'transcri', 'keyword_spotting', 'kaldi', 'nemo', 'WenetModel', 'Zipformer')
foreach ($p in $asr) {
  $tot = 0
  foreach ($f in $js) { $tot += Count-Text $f.FullName $p }
  Write-Output ("  {0,-22} dist code = {1}" -f $p, $tot)
}
Write-Output "  -- model-like assets on disk --"
$assets = @(Get-ChildItem $ex -Recurse -File -Include *.onnx, *.tflite, *.bin, *.pt, *.pb, *.nemo, *.mdl, *.ort, *.gguf -ErrorAction SilentlyContinue)
Write-Output "  model assets = $($assets.Count)"
$assets | Select-Object -First 15 Length, FullName | Format-Table -AutoSize | Out-String