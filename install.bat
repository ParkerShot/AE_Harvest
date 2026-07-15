@echo off
setlocal enabledelayedexpansion
title AE Harvest - installer

echo.
echo   ============================================
echo    AE Harvest - installer
echo   ============================================
echo.

rem --- the script must sit next to this installer ---
set "SRC=%~dp0AE_Harvest_Panel.jsx"
if not exist "%SRC%" (
    echo   [ERROR] AE_Harvest_Panel.jsx not found next to install.bat
    echo   Unpack the whole archive first, then run install.bat from inside it.
    echo.
    pause
    exit /b 1
)

rem --- Program Files needs admin: relaunch elevated, then continue there ---
net session >nul 2>&1
if errorlevel 1 (
    echo   Asking for administrator rights ^(needed to write to Program Files^)...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs" >nul 2>&1
    if errorlevel 1 (
        echo   [ERROR] Elevation was refused. Nothing installed.
        pause
    )
    exit /b
)

set /a FOUND=0
set /a OK=0

for /d %%D in ("%ProgramFiles%\Adobe\Adobe After Effects *") do (
    set "TARGET=%%~D\Support Files\Scripts\ScriptUI Panels"
    if exist "!TARGET!\" (
        set /a FOUND+=1
        copy /Y "%SRC%" "!TARGET!\AE_Harvest_Panel.jsx" >nul 2>&1
        if errorlevel 1 (
            echo   [FAILED]    %%~nxD  ^(is After Effects running as admin?^)
        ) else (
            echo   [INSTALLED] %%~nxD
            set /a OK+=1
        )
    )
)

echo.
if !FOUND!==0 (
    echo   [ERROR] No After Effects installation found in:
    echo           %ProgramFiles%\Adobe\
    echo.
    echo   Install it manually: copy AE_Harvest_Panel.jsx into
    echo   ...\Adobe After Effects ^<version^>\Support Files\Scripts\ScriptUI Panels\
    echo.
    echo   Or skip installing altogether - in After Effects use
    echo   File ^> Scripts ^> Run Script File... and pick the .jsx
) else if !OK!==0 (
    echo   [ERROR] Found After Effects, but could not copy the file.
) else (
    echo   Done - installed into !OK! of !FOUND! After Effects version^(s^).
    echo.
    echo   NEXT: restart After Effects, then open
    echo         Window ^> AE_Harvest_Panel.jsx
)
echo.
pause
