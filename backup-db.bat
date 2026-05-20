@echo off

cd /d C:\Users\jddnl\Desktop\project-a2cde3af-776d-4a34-8dee-1071ccdd1690

for /f %%i in ('powershell -command "Get-Date -Format yyyy-MM-dd_HH-mm"') do set datetime=%%i

supabase db dump ^
-f backups\backup-%datetime%.sql

forfiles /p backups /s /m *.sql /d -30 /c "cmd /c del @path" 2>nul

echo Backup Complete!
pause