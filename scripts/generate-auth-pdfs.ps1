# Regenerates developer PDF guides from HTML sources (Chrome headless).
# Usage: powershell -File scripts/generate-auth-pdfs.ps1

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { throw "Google Chrome not found" }

function Wait-File([string]$path, [int]$seconds = 30) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    if ((Test-Path $path) -and ((Get-Item $path).Length -gt 1000)) { return }
    Start-Sleep -Milliseconds 400
  }
  throw "Timed out waiting for $path"
}

$jobs = @(
  @{
    html = Join-Path $root "docs\pdf-sources\react-auth-guide-fa.html"
    name = "Dlander-React-Authentication-FA.pdf"
  },
  @{
    html = Join-Path $root "docs\pdf-sources\wordpress-auth-guide-fa.html"
    name = "Dlander-WordPress-Authentication-FA.pdf"
  }
)

foreach ($t in $jobs) {
  $outTmp = Join-Path $env:TEMP $t.name
  if (Test-Path $outTmp) { Remove-Item $outTmp -Force }
  $uri = ([Uri](Resolve-Path $t.html)).AbsoluteUri
  $p = Start-Process -FilePath $chrome -ArgumentList @(
    "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
    "--print-to-pdf=$outTmp", $uri
  ) -PassThru -WindowStyle Hidden
  $null = $p.WaitForExit(90000)
  Wait-File $outTmp
  foreach ($destDir in @("docs", "src\assets\docs", "dist\assets\docs")) {
    $dir = Join-Path $root $destDir
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
    Copy-Item $outTmp (Join-Path $dir $t.name) -Force
  }
  Write-Host "Wrote $($t.name) ($((Get-Item $outTmp).Length) bytes)"
}
