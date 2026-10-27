@echo off
cd /d "%~dp0"
if not exist reception\.env (
  echo Configure reception\.env segun reception\README.md.
  pause
  exit /b 1
)
echo Abra http://127.0.0.1:3220. Esta ventana mantiene activa la recepcion local.
call npm.cmd run reception
pause
