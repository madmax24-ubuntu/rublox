param(
    [string]$Build = (Join-Path (Split-Path -Parent $PSScriptRoot) 'yandex-game'),
    [string]$Archive = (Join-Path (Split-Path -Parent $PSScriptRoot) 'yandex-game.zip')
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$source = (Resolve-Path -LiteralPath $Build).Path.TrimEnd('\') + '\'
$files = @(Get-ChildItem -LiteralPath $source -File -Recurse | Sort-Object FullName)
$pending = $Archive + '.' + [Guid]::NewGuid().ToString('N') + '.tmp'
$zip = [IO.Compression.ZipFile]::Open($pending, [IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($file in $files) {
        $name = $file.FullName.Substring($source.Length).Replace('\', '/')
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, $name, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
} finally { $zip.Dispose() }
$zip = [IO.Compression.ZipFile]::OpenRead($pending)
try {
    if ($zip.Entries.Count -ne $files.Count) { throw 'ZIP file count mismatch' }
    if (-not $zip.GetEntry('index.html')) { throw 'Root index.html missing' }
    foreach ($entry in $zip.Entries) {
        if ($entry.FullName.Contains('\')) { throw 'Backslash in ZIP path' }
    }
    foreach ($file in $files) {
        $name = $file.FullName.Substring($source.Length).Replace('\', '/')
        $entry = $zip.GetEntry($name)
        if (-not $entry) { throw "Missing ZIP path: $name" }
        $stream = $entry.Open()
        $sha = [Security.Cryptography.SHA256]::Create()
        try { $hash = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '') }
        finally { $stream.Dispose(); $sha.Dispose() }
        if ($hash -ne (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash) { throw "ZIP content mismatch: $name" }
    }
} finally { $zip.Dispose() }
Move-Item -LiteralPath $pending -Destination $Archive -Force
Write-Host "ZIP verified: $($files.Count) files, forward-slash paths, SHA256 contents matched"
