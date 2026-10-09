@echo off
title AHAM - Automatic VR Feedback
cd /d "%~dp0"
echo Automatic feedback uses the running USB glove companion.
echo For a bench test, power USB and actuator rails, glove off and threads slack.
echo Open the current Orbit game on Quest; keep your right hand clear of objects.
echo STOP cancels automatic mode. Hardware limits still apply.
pause
".venv\Scripts\python.exe" tools\glove_command.py AUTO ARM BOTH ALL
pause
