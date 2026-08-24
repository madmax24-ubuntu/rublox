Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
 Where-Object { $_.CommandLine -match 'no-default-browser-check' -and $_.CommandLine -match 'window-size=1280,800' } |
 ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; $_.ProcessId }
