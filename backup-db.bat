@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\backup-supabase.ps1"
exit /b %errorlevel%
