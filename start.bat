@echo off
set "ROOT=%~dp0"
echo Starting AnySchool...

echo.
echo [1/3] Starting API server...
start "AnySchool API" powershell -NoExit -Command "cd '%ROOT%api'; npx tsx src/index.ts"

echo [2/3] Starting Vite dev server...
start "AnySchool Vite" powershell -NoExit -Command "cd '%ROOT%web'; npx vite --host"

echo [3/3] Starting Desktop app...
start "AnySchool Desktop" powershell -NoExit -Command "cd '%ROOT%'; npx tauri dev"

echo.
echo All servers started! Wait a few seconds for them to load.
echo   API:      http://localhost:3000
echo   Web:      http://localhost:5174
echo   Desktop:  opens automatically
echo.
pause