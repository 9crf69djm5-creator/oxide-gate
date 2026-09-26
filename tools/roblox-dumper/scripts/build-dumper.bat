@echo off
setlocal EnableExtensions
REM Build OxideDumper.exe (Release x64) and copy next to Oxide.exe

set "ROOT=%~dp0..\.."
set "DUMPER=%ROOT%\tools\roblox-dumper"
set "OUT=%ROOT%\x64\Release"
set "BUILD=%DUMPER%\out\x64-release"
set "VS=C:\Program Files\Microsoft Visual Studio\2022\Community"
set "VCVARS=%VS%\VC\Auxiliary\Build\vcvars64.bat"
set "NINJA=%VS%\Common7\IDE\CommonExtensions\Microsoft\CMake\Ninja\ninja.exe"
set "CMAKE=C:\Program Files\CMake\bin\cmake.exe"

if not exist "%VCVARS%" (
  echo [!] vcvars64.bat not found at "%VCVARS%"
  exit /b 1
)
if not exist "%CMAKE%" (
  echo [!] cmake not found
  exit /b 1
)

call "%VCVARS%" >nul
if errorlevel 1 exit /b 1

mkdir "%OUT%" 2>nul
mkdir "%BUILD%" 2>nul

echo [*] Configuring roblox-dumper...
"%CMAKE%" -S "%DUMPER%" -B "%BUILD%" -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_MAKE_PROGRAM="%NINJA%"
if errorlevel 1 exit /b 1

echo [*] Building...
"%CMAKE%" --build "%BUILD%" --config Release
if errorlevel 1 exit /b 1

if exist "%BUILD%\roblox-dumper.exe" (
  copy /Y "%BUILD%\roblox-dumper.exe" "%OUT%\OxideDumper.exe" >nul
) else if exist "%BUILD%\Release\roblox-dumper.exe" (
  copy /Y "%BUILD%\Release\roblox-dumper.exe" "%OUT%\OxideDumper.exe" >nul
) else (
  echo [!] Built binary not found under "%BUILD%"
  exit /b 1
)

if not exist "%OUT%\oxide_dumper.ini" (
  copy /Y "%DUMPER%\oxide_dumper.ini.example" "%OUT%\oxide_dumper.ini" >nul
)

echo [+] OxideDumper.exe -^> "%OUT%\OxideDumper.exe"
echo     Configure adminSecret in oxide_dumper.ini to auto-upload to the site.
exit /b 0
