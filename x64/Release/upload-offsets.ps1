# Upload newest RbxDumperV2 Offsets.json to OXIDE gate-api (public /api/offsets).
param(
  [string]$DumpRoot = $PSScriptRoot,
  [string]$ApiBase = "",
  [string]$AdminSecret = ""
)

$ErrorActionPreference = "Stop"

function Read-Ini([string]$path, [string]$key) {
  if (-not (Test-Path -LiteralPath $path)) { return "" }
  foreach ($line in Get-Content -LiteralPath $path) {
    $t = $line.Trim()
    if ($t -match '^\s*#' -or $t -eq "") { continue }
    if ($t -match "^$([regex]::Escape($key))\s*=\s*(.+)$") {
      return $Matches[1].Trim()
    }
  }
  return ""
}

$ini = Join-Path $DumpRoot "oxide_dumper.ini"
if (-not $ApiBase) {
  $ApiBase = Read-Ini $ini "api"
  if (-not $ApiBase) { $ApiBase = $env:OXIDE_API }
  if (-not $ApiBase) { $ApiBase = "https://oxide-gate-api.onrender.com" }
}
if (-not $AdminSecret) {
  $AdminSecret = Read-Ini $ini "adminSecret"
  if (-not $AdminSecret) { $AdminSecret = Read-Ini $ini "ADMIN_SECRET" }
  if (-not $AdminSecret) { $AdminSecret = $env:OXIDE_ADMIN_SECRET }
  if (-not $AdminSecret) { $AdminSecret = $env:ADMIN_SECRET }
}

if (-not $AdminSecret -or $AdminSecret -like "REPLACE*") {
  Write-Host "[!] Set adminSecret in oxide_dumper.ini (or ADMIN_SECRET env) to upload."
  exit 2
}

$dirs = Get-ChildItem -LiteralPath $DumpRoot -Directory -Filter "version-*" -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending
if (-not $dirs) {
  Write-Host "[!] No version-* dump folder found in $DumpRoot"
  exit 3
}

$jsonPath = Join-Path $dirs[0].FullName "Offsets.json"
if (-not (Test-Path -LiteralPath $jsonPath)) {
  Write-Host "[!] Missing Offsets.json in $($dirs[0].Name)"
  exit 4
}

Write-Host "[*] Uploading $($dirs[0].Name)\Offsets.json -> $ApiBase/api/admin/offsets"
$body = Get-Content -LiteralPath $jsonPath -Raw
$headers = @{
  "Content-Type" = "application/json"
  "X-Admin-Secret" = $AdminSecret
}
try {
  $res = Invoke-RestMethod -Method Post -Uri "$ApiBase/api/admin/offsets" -Headers $headers -Body $body
  Write-Host "[+] Uploaded. version=$($res.robloxVersion) total=$($res.totalOffsets)"
  Write-Host "    Public: $ApiBase/api/offsets"
  Write-Host "    Page:   https://oxide-gate-site.vercel.app/offsets"
} catch {
  Write-Host "[!] Upload failed: $($_.Exception.Message)"
  if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message }
  exit 1
}
