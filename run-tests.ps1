<#
.SYNOPSIS
  Runs the unit test suite for UdemyDownloader using Node.js or embedded Node.
#>

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmd) {
  Write-Host "Running tests with system Node.js ($(& node -v))..." -ForegroundColor Cyan
  node --test tests/*.test.js
} else {
  # Fallback to embedded Node runner
  $vsCodeNode = "C:\Users\weihon\AppData\Local\Programs\Microsoft VS Code Insiders\Code - Insiders.exe"
  if (Test-Path $vsCodeNode) {
    Write-Host "Running tests with Node v24 (via VS Code runtime)..." -ForegroundColor Cyan
    $env:ELECTRON_RUN_AS_NODE = 1
    & $vsCodeNode --test tests/*.test.js | Out-Host
  } else {
    Write-Error "Node.js executable not found. Please install Node.js (v18+) to run tests."
  }
}
