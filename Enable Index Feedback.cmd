@echo off
cd /d "%~dp0"
echo Keep the glove off your hand and threads slack for this bench test.
echo Check that the NodeMCU USB and actuator rails are powered.
pause
".venv\Scripts\python.exe" tools\glove_command.py ARM BOTH INDEX
pause
