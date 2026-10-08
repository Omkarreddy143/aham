@echo off
title AHAM - Refresh VR Link
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo The AHAM Python environment is missing. Follow docs\webxr-quickstart.md.
  pause
  exit /b 1
)
".venv\Scripts\python.exe" -u "tools\vr_link.py" --force
echo.
pause
