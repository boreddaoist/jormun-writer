@echo off
REM Opens Jormun Writer on the last project you used.
REM ELECTRON_RUN_AS_NODE is set by VS Code terminals and would stop Electron from starting.
set ELECTRON_RUN_AS_NODE=
cd /d "%~dp0"
npm run dev
