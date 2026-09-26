@echo off
setlocal
cd /d "%~dp0"

echo.
echo  OXIDE Roblox dumper (RbxDumperV2 engine)
echo  1) Join https://www.roblox.com/games/113264082193197/Dumper9000
echo  2) Do NOT move the camera after joining
echo  3) This script will dump, then upload to gate-api if oxide_dumper.ini is set
echo.

if not exist "config.json" (
  echo Creating default config.json...
  > config.json echo {"placeId":113264082193197,"gameId":8220026920,"creatorId":8979812863}
)

if not exist "OxideDumper.exe" (
  if exist "RbxDumperV2.exe" (
    copy /Y RbxDumperV2.exe OxideDumper.exe >nul
  ) else (
    echo [!] OxideDumper.exe missing. Build tools\RbxDumperV2 first.
    pause
    exit /b 1
  )
)

OxideDumper.exe
if errorlevel 1 (
  echo [!] Dump failed.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0upload-offsets.ps1"
echo.
pause
