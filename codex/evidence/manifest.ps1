$ErrorActionPreference = 'Stop'
$root = 'C:\Program Files\WindowsApps\OpenAI.Codex_26.1007.2314.0_x64__2p2nqsd0c76g0'
$w    = 'C:\Users\AI-Howard\.minimax\sessions\mvs_2a470b365312405386e136ff583fc299\workspace\codex'
$ev   = Join-Path $w 'evidence'
New-Item -ItemType Directory -Force -Path $ev, (Join-Path $w 'reports') | Out-Null
$out  = Join-Path $ev 'manifest.tsv'

$targets = @()
$targets += Get-ChildItem -LiteralPath $root -File
$targets += Get-ChildItem -LiteralPath "$root\app" -File
$targets += Get-ChildItem -LiteralPath "$root\app\resources" -File
foreach ($d in @('app.asar.unpacked','native','default_app','accessibility','plugins','skills','plugin-signatures','cua_node','artifact-template-picker')) {
    $p = Join-Path "$root\app\resources" $d
    if (Test-Path $p) { $targets += Get-ChildItem -LiteralPath $p -Recurse -File }
}
$targets += Get-ChildItem -LiteralPath "$root\app\tools" -Recurse -File -ErrorAction SilentlyContinue

$rows = @()
foreach ($f in $targets) {
    $rel = $f.FullName.Substring($root.Length + 1)
    $h = (Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash.ToLower()
    $chars = $null
    $ext = $f.Extension.ToLower()
    if ($ext -in @('.json','.xml','.html','.js','.mjs','.cjs','.txt','.md','.css','.yml','.yaml','.ini','') -and $f.Length -lt 200MB) {
        try { $chars = [System.IO.File]::ReadAllText($f.FullName).Length } catch { $chars = 'ERR' }
    }
    $rows += [pscustomobject]@{ path=$rel; bytes=$f.Length; chars=$chars; sha256=$h }
}
$rows = $rows | Sort-Object path -Unique
$rows | Export-Csv -LiteralPath $out -Delimiter "`t" -NoTypeInformation -Encoding UTF8
Write-Output "rows: $($rows.Count)"
Write-Output "wrote: $out"
Write-Output ""
Write-Output "=== security-relevant binaries ==="
$rows | Where-Object { $_.path -match 'elevation|sandbox|codex\.exe|codex$|command-runner|code-mode-host|notification|\.asar$|plugin-signatures' } |
  ForEach-Object { "{0,-62} {1,12} {2,12} {3}" -f $_.path, $_.bytes, $_.chars, $_.sha256.Substring(0,16) }
