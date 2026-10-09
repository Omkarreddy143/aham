@echo off
title AHAM - Orbit Foundry Connection Check
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo AHAM Python environment is missing. Follow docs\webxr-quickstart.md.
  pause
  exit /b 1
)
".venv\Scripts\python.exe" -u "tools\orbit_status.py" %*
set "ahamCheckExit=%errorlevel%"
echo.
pause
exit /b %ahamCheckExit%
