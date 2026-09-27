<#
.SYNOPSIS
  Publish a new Oxide.exe release: version bump -> build -> site/API downloads ->
  releases.json -> git push (Vercel + Render redeploy) -> verify -> Discord announcement.

.EXAMPLE
  .\release.ps1 -Title "3D chams" -NotesFile .\release-notes.txt
  .\release.ps1 -Bump minor -Title "Aimbot rework" -Notes "Smoother aim","New FOV circle"
  powershell -ExecutionPolicy Bypass -File .\release.ps1 -Title "Fix" -Notes "Crash fix|Faster attach"

  Notes: one bullet per -Notes entry (or split on "|"), or one bullet per line in -NotesFile.
  Admin secret for the instant Discord trigger: $env:OXIDE_ADMIN_SECRET, else discord-bot\.env ADMIN_SECRET.
  Without it the bot still announces on its own poll (RELEASE_POLL_MINUTES, default 5).
#>
[CmdletBinding()]
param(
  [string]$Version,
  [ValidateSet("patch", "minor", "major")][string]$Bump = "patch",
  [string]$Title = "",
  [string[]]$Notes,
  [string]$NotesFile,
  [switch]$SkipBuild,
  [switch]$NoPush,
  [switch]$NoAnnounce,
  [switch]$Force,
  [int]$DeployTimeoutMinutes = 20
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Root = $PSScriptRoot
$ApiBase = if ($env:OXIDE_API_BASE) { $env:OXIDE_API_BASE.TrimEnd("/") } else { "https://oxide-gate-api.onrender.com" }
$SiteUrl = if ($env:OXIDE_SITE_URL) { $env:OXIDE_SITE_URL.TrimEnd("/") } else { "https://oxide-gate-site.vercel.app" }
$BotUrl = if ($env:OXIDE_BOT_URL) { $env:OXIDE_BOT_URL.TrimEnd("/") } else { "https://oxide-discord-bot-fra.onrender.com" }
$Meta = Join-Path $Root "tools\release\release-meta.js"

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor DarkYellow }
function Ok($msg) { Write-Host "    $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "    $msg" -ForegroundColor Yellow }

function Invoke-Meta {
  $out = & node $Meta @args
  if ($LASTEXITCODE -ne 0) { throw "release-meta failed: $($args -join ' ')" }
  return $out
}

function Get-Sha256([string]$Path) {
  return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

function Get-RemoteSha256([string]$Url) {
  $tmp = [IO.Path]::GetTempFileName()
  try {
    Invoke-WebRequest -Uri $Url -OutFile $tmp -UseBasicParsing -TimeoutSec 180 -Headers @{ "Cache-Control" = "no-cache" }
    return Get-Sha256 $tmp
  } finally {
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
  }
}

function Wait-Until([string]$What, [scriptblock]$Check) {
  $deadline = (Get-Date).AddMinutes($DeployTimeoutMinutes)
  $last = ""
  while ((Get-Date) -lt $deadline) {
    try {
      $r = & $Check
      if ($r -eq $true) { Ok "$What - OK"; return $true }
      if ($r) { $last = "$r" }
    } catch {
      if ($_.Exception.Message -like "FATAL:*") { throw }
      $last = $_.Exception.Message
    }
    Write-Host "    waiting for $What... $last" -ForegroundColor DarkGray
    Start-Sleep -Seconds 20
  }
  Warn "$What - timed out after $DeployTimeoutMinutes min ($last)"
  return $false
}

function Get-AdminSecret {
  if ($env:OXIDE_ADMIN_SECRET) { return $env:OXIDE_ADMIN_SECRET.Trim() }
  $envFile = Join-Path $Root "discord-bot\.env"
  if (Test-Path $envFile) {
    $line = Get-Content $envFile | Where-Object { $_ -match '^\s*ADMIN_SECRET\s*=' } | Select-Object -First 1
    if ($line) {
      $v = ($line -split "=", 2)[1].Trim().Trim('"')
      if ($v) { return $v }
    }
  }
  return $null
}

Set-Location $Root

# ---- 1. Release notes ---------------------------------------------------------
Step "Collecting release notes"
$noteLines = @()
if ($NotesFile) {
  $noteLines += Get-Content -LiteralPath $NotesFile
} 
if ($Notes) {
  foreach ($n in $Notes) { $noteLines += ($n -split "\|") }
}
$noteLines = @($noteLines | ForEach-Object { ($_ -replace '^\s*[-*]\s*', '').Trim() } | Where-Object { $_ })
if ($noteLines.Count -eq 0) { throw "Provide release notes with -Notes or -NotesFile (what the update is for)." }
$noteLines | ForEach-Object { Ok "- $_" }

# ---- 2. Version ---------------------------------------------------------------
Step "Resolving version"
$metaArgs = @("next", "--bump", $Bump)
if ($Version) { $metaArgs += @("--version", $Version) }
$NewVersion = (Invoke-Meta @metaArgs).Trim()
Ok "New version: v$NewVersion"

# ---- 3. Build -----------------------------------------------------------------
Invoke-Meta stamp --version $NewVersion | Out-Null
Ok "Stamped External\src\version.h"
$Exe = Join-Path $Root "x64\Release\Oxide.exe"
if (-not $SkipBuild) {
  Step "Building External.sln Release|x64"
  $vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
  $msbuild = $null
  if (Test-Path $vswhere) {
    $msbuild = & $vswhere -latest -products * -requires Microsoft.Component.MSBuild -find "MSBuild\**\Bin\MSBuild.exe" | Select-Object -First 1
  }
  if (-not $msbuild) { throw "MSBuild not found (install Visual Studio with C++ workload)." }
  $ErrorActionPreference = "Continue"
  & $msbuild (Join-Path $Root "External.sln") /m /nologo /v:minimal /p:Configuration=Release /p:Platform=x64
  $buildCode = $LASTEXITCODE
  $ErrorActionPreference = "Stop"
  if ($buildCode -ne 0) { throw "Build failed (is Oxide.exe still running?)." }
}
if (-not (Test-Path $Exe)) { throw "Missing $Exe" }
$ExeSha = Get-Sha256 $Exe
$PrevSha = (Invoke-Meta latest-sha).Trim()
Ok "Oxide.exe sha256 $ExeSha"
if ($PrevSha -and $PrevSha -eq $ExeSha -and -not $Force) {
  throw "Oxide.exe is identical to the last release ($PrevSha). Nothing to publish (use -Force to override)."
}

# ---- 4. Publish binaries to site + API ---------------------------------------
Step "Copying binaries into site/API downloads"
$Targets = @(
  (Join-Path $Root "gate-api\public\downloads"),
  (Join-Path $Root "gate-site\public\downloads")
)
foreach ($dir in $Targets) {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  Copy-Item -LiteralPath $Exe -Destination (Join-Path $dir "Oxide.exe") -Force
}
Ok "Oxide.exe -> gate-api + gate-site"

$Dumper = Join-Path $Root "x64\Release\OxideDumper.exe"
$DumperArg = @()
if (Test-Path $Dumper) {
  $dSha = Get-Sha256 $Dumper
  foreach ($dir in $Targets) {
    $dest = Join-Path $dir "OxideDumper.exe"
    if (-not (Test-Path $dest) -or (Get-Sha256 $dest) -ne $dSha) {
      Copy-Item -LiteralPath $Dumper -Destination $dest -Force
      Ok "OxideDumper.exe updated in $dir"
    }
  }
  $DumperArg = @("--dumper", $Dumper)
}

# ---- 5. Record release --------------------------------------------------------
Step "Recording release in gate-api/data/releases.json"
$notesTmp = [IO.Path]::GetTempFileName()
[IO.File]::WriteAllLines($notesTmp, [string[]]$noteLines, (New-Object Text.UTF8Encoding($false)))
try {
  $recordArgs = @("record", "--version", $NewVersion, "--notes-file", $notesTmp, "--exe", $Exe) + $DumperArg
  if ($Title) { $recordArgs += @("--title", $Title) }
  $entry = (Invoke-Meta @recordArgs) | ConvertFrom-Json
} finally {
  Remove-Item -LiteralPath $notesTmp -Force -ErrorAction SilentlyContinue
}
Ok "Recorded v$($entry.version) ($($entry.date)) targeting $($entry.clientVersion)"

# ---- 6. Commit + push ---------------------------------------------------------
$Paths = @(
  "gate-api/data/releases.json",
  "gate-api/data/client-version.txt",
  "gate-api/public/downloads/Oxide.exe",
  "gate-site/public/releases.json",
  "gate-site/public/downloads/Oxide.exe"
)
foreach ($p in @("gate-api/public/downloads/OxideDumper.exe", "gate-site/public/downloads/OxideDumper.exe")) {
  if (Test-Path (Join-Path $Root $p)) { $Paths += $p }
}
$commitMsg = "Release Oxide v$NewVersion" + $(if ($Title) { ": $Title" } else { "" })

if ($NoPush) {
  Warn "-NoPush: files updated locally, nothing committed. Commit these paths yourself: $($Paths -join ', ')"
  exit 0
}

Step "Committing and pushing"
# git writes progress to stderr; keep that from tripping ErrorActionPreference=Stop.
$ErrorActionPreference = "Continue"
git add -- $Paths
if ($LASTEXITCODE -ne 0) { throw "git add failed" }
git commit -m $commitMsg -- $Paths
if ($LASTEXITCODE -ne 0) { throw "git commit failed" }
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
git push origin "HEAD:main" 2>&1 | ForEach-Object { Write-Host "    $_" }
if ($LASTEXITCODE -ne 0) { throw "git push failed (branch $branch)" }
$ErrorActionPreference = "Stop"
Ok "Pushed $commitMsg - Render (gate-api) and Vercel (gate-site) redeploy from origin/main"

# ---- 7. Verify live -----------------------------------------------------------
Step "Verifying live deploys (up to $DeployTimeoutMinutes min each)"
$qs = "?v=$NewVersion"
$apiOk = Wait-Until "API /api/releases/latest = v$NewVersion" {
  $r = Invoke-RestMethod -Uri "$ApiBase/api/releases/latest" -TimeoutSec 60 -Headers @{ "Cache-Control" = "no-cache" }
  if ($r.release.version -eq $NewVersion -and $r.release.hosted.matches -eq $true) { return $true }
  return "API reports v$($r.release.version)"
}
$apiDlOk = $false
if ($apiOk) {
  $apiDlOk = Wait-Until "API download hash" {
    $h = Get-RemoteSha256 "$ApiBase/downloads/Oxide.exe$qs"
    if ($h -eq $ExeSha) { return $true }
    return "got $h"
  }
}
$siteOk = Wait-Until "Site download hash" {
  $h = Get-RemoteSha256 "$SiteUrl/downloads/Oxide.exe$qs"
  if ($h -eq $ExeSha) { return $true }
  return "got $h"
}
try {
  $ext = Invoke-RestMethod -Uri "$ApiBase/api/external-version" -TimeoutSec 90
  if ($ext.matched) { Ok "Status page: Roblox version match OK ($($ext.hostedClientVersion))" }
  else { Warn "Status page: $($ext.status) - hosted $($ext.hostedClientVersion) vs live $($ext.liveRobloxVersion)" }
} catch { Warn "Could not read /api/external-version: $($_.Exception.Message)" }

# ---- 8. Discord announcement --------------------------------------------------
$announce = $null
if (-not $NoAnnounce -and $apiOk) {
  Step "Triggering Discord announcement"
  $secret = Get-AdminSecret
  if (-not $secret) {
    Warn "No OXIDE_ADMIN_SECRET / discord-bot\.env ADMIN_SECRET - the bot will announce on its next poll."
  } else {
    [void](Wait-Until "bot announcement" {
      try {
        $script:announce = Invoke-RestMethod -Method Post -Uri "$BotUrl/internal/announce-release" `
          -Headers @{ "X-Admin-Secret" = $secret } -ContentType "application/json" -Body "{}" -TimeoutSec 90
      } catch {
        $code = $_.Exception.Response.StatusCode.value__
        if ($code -eq 401) { throw "FATAL: bot rejected ADMIN_SECRET (401) - must match Render oxide-discord-bot-fra ADMIN_SECRET." }
        return "HTTP $code (bot may still be deploying)"
      }
      if ($script:announce.ok -and $script:announce.version -eq $NewVersion) { return $true }
      return "$($script:announce.error) $($script:announce.message)"
    })
    $announce = $script:announce
    if ($announce -and $announce.ok) {
      if ($announce.announced) { Ok "Announced v$($announce.version) in #$($announce.channelName) (message $($announce.messageId))" }
      else { Ok "v$($announce.version) was already announced (message $($announce.messageId))" }
    }
  }
}

# ---- Summary ------------------------------------------------------------------
Step "Release v$NewVersion summary"
Write-Host ("    API latest       : " + $(if ($apiOk) { "OK" } else { "NOT CONFIRMED" }))
Write-Host ("    API download     : " + $(if ($apiDlOk) { "hash OK" } else { "NOT CONFIRMED" }))
Write-Host ("    Site download    : " + $(if ($siteOk) { "hash OK" } else { "NOT CONFIRMED" }))
Write-Host ("    Discord          : " + $(if ($announce -and $announce.ok) { "posted/confirmed" } else { "pending (bot poll) or not triggered" }))
Write-Host "    Changelog        : $SiteUrl/changelog"
if (-not ($apiOk -and $siteOk)) { exit 1 }
