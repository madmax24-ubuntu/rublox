$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$build = Join-Path $root "yandex-game"
$archive = Join-Path $root "yandex-game.zip"
Set-Location $root
& npm run build:yandex-game
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Get-ChildItem -LiteralPath $build -Recurse -Filter "*.js" | ForEach-Object {
    & node --check $_.FullName
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
$html = Get-Content -LiteralPath (Join-Path $build "index.html") -Raw
$main = Get-Content -LiteralPath (Join-Path $build "main.js") -Raw
$bridge = Get-Content -LiteralPath (Join-Path $build "core\YandexBridge.js") -Raw
if (-not $html.Contains('<script src="/sdk.js"></script>')) { throw "Yandex SDK loader is missing" }
if (-not $html.Contains("YaGames.init()")) { throw "YaGames.init is missing" }
if (-not $bridge.Contains("LoadingAPI")) { throw "LoadingAPI is missing" }
$hideIndex = $main.IndexOf('if (loadingOverlay) loadingOverlay.style.display = "none";', $main.IndexOf('window.addEventListener("DOMContentLoaded"'))
$readyIndex = $main.IndexOf("yandex.signalReady();", $hideIndex)
$enableIndex = $main.IndexOf("startButtons.forEach", $readyIndex)
$gameIndex = $main.IndexOf("const game = new Game(yandex);", $enableIndex)
if ($hideIndex -lt 0 -or $readyIndex -le $hideIndex -or $enableIndex -le $readyIndex -or $gameIndex -le $enableIndex) { throw "GameReady ordering is invalid" }
if ($main.Substring(0, $readyIndex) -match 'game\.ready') { throw "GameReady waits for game generation" }
if (([regex]::Matches($html, 'id="startButton(?:Desktop|Mobile|MobileLandscape)"[^>]*disabled')).Count -ne 3) { throw "Start buttons are not guarded" }
Compress-Archive -Path (Join-Path $build "*") -DestinationPath $archive -CompressionLevel Optimal -Force
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($archive)
try {
    $rootIndex = @($zip.Entries | Where-Object FullName -eq "index.html")
    if ($rootIndex.Count -ne 1) { throw "Archive must contain one root index.html" }
} finally {
    $zip.Dispose()
}
$hash = Get-FileHash -LiteralPath $archive -Algorithm SHA256
Write-Host "Archive: $archive"
Write-Host "SHA256: $($hash.Hash)"
