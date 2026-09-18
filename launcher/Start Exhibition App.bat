@echo off
setlocal
cd /d "%~dp0app"

rem ---- Change this password before the show, then save the file. ----
set ADMIN_PASSWORD=langhao2026

set PORT=4000
set HOSTNAME=127.0.0.1

echo Starting the exhibition app...
echo Do not close the black window that opens next - closing it stops the app.
echo.

start "Langhao Exhibition App - do not close this window" "%~dp0node\node.exe" "server.js"

timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:4000"

endlocal
