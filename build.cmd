@echo off
chcp 65001 >nul
echo ==========================================
echo   Claw Router Manager - Build Script
echo ==========================================
echo.

if not exist "node_modules" (
    echo [INFO] Dang cai dat dependencies...
    call npm install
    if errorlevel 1 (
        echo [LOI] Cai dat dependencies that bai.
        pause
        exit /b 1
    )
)

echo [INFO] Dang build Installer (NSIS) + Portable...
call npm run build:all

if errorlevel 1 (
    echo [LOI] Build that bai.
    pause
    exit /b 1
)

echo.
echo [OK] Build hoan tat! Cac file nam trong thu muc dist\
echo.
pause
