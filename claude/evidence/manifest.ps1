$ErrorActionPreference = 'Stop'
$root = 'C:\Program Files\WindowsApps\Claude_2.31226.1.0_x64__pzs8sxrjxfjjc'
$out  = 'C:\Users\AI-Howard\.minimax\sessions\mvs_2a470b365312405386e136ff583fc299\workspace\claude\evidence\manifest.tsv'

$rows = @()
$targets = @()
$targets += Get-ChildItem -LiteralPath $root -File
$targets += Get-ChildItem -LiteralPath "$root\app" -File
$targets += Get-ChildItem -LiteralPath "$root\app\resources" -File
$targets += Get-ChildItem -LiteralPath "$root\app\resources\app.asar.unpacked" -Recurse -File
$targets += Get-ChildItem -LiteralPath "$root\app\resources\ion-dist" -File

foreach ($f in $targets) {
    $rel = $f.FullName.Substring($root.Length + 1)
    $h = (Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256).Hash.ToLower()
    $bytes = $f.Length
    $chars = $null
    # char count only for plausible text
    $ext = $f.Extension.ToLower()
    if ($ext -in @('.json','.xml','.html','.js','.mjs','.txt','.md','.jsn','.css','.yml','.yaml','')) {
        if ($f.Length -lt 200MB) {
            try {
                $t = [System.IO.File]::ReadAllText($f.FullName)
                $chars = $t.Length
            } catch { $chars = 'ERR' }
        }
    }
    $rows += [pscustomobject]@{ path=$rel; bytes=$bytes; chars=$chars; sha256=$h }
}

$rows | Sort-Object path | Export-Csv -LiteralPath $out -Delimiter "`t" -NoTypeInformation -Encoding UTF8
Write-Output "rows: $($rows.Count)"
Write-Output "wrote: $out"
Write-Output ""
Write-Output "=== key hashes ==="
$rows | Where-Object { $_.path -match 'app\.asar$|claude\.exe$|cowork-svc|claude-ssh|custom-3p|scc\.json|version$|AppxSignature|AppxManifest' } |
    Sort-Object path | ForEach-Object { "{0,-58} {1,12} {2}" -f $_.path, $_.bytes, $_.sha256 }
