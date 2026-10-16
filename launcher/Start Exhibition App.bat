@echo off
setlocal
cd /d "%~dp0app"

rem ---- Data stays where earlier versions of this package kept it. ----
set "DATA_DIR=%~dp0app\data"

rem ---- Admin password: generated once, then kept in admin-password.txt ----
rem ---- next to this file. To change it, edit that file (12+ characters). ----
if not exist "%~dp0admin-password.txt" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$c=[char[]]((48..57)+(65..90)+(97..122)); $r=New-Object Security.Cryptography.RNGCryptoServiceProvider; $b=New-Object byte[] 20; $r.GetBytes($b); -join ($b | ForEach-Object { $c[$_ %% 62] }) | Out-File -Encoding ascii -NoNewline -FilePath '%~dp0admin-password.txt'"
)
set /p ADMIN_PASSWORD=<"%~dp0admin-password.txt"

set PORT=4000
set HOSTNAME=127.0.0.1

echo Starting the exhibition app...
echo Staff password is in: %~dp0admin-password.txt
echo Do not close the black window that opens next - closing it stops the app.
echo.

start "Langhao Exhibition App - do not close this window" "%~dp0node\node.exe" "server.js"

timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:4000"

endlocal
