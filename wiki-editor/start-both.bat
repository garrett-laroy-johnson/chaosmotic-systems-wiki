@echo off
echo Starting Chaosmotic Systems Wiki - Complete System
echo ================================================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo Error: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Navigate to the parent directory
cd ..

echo Starting Quartz preview server on port 8080...
echo This will show the final wiki website
start "Quartz Preview" cmd /c "npx quartz build --serve"

echo.
echo Waiting for Quartz to start...
timeout /t 5 /nobreak > nul

echo Starting Wiki Editor on port 3000...
echo This is where students will edit content
cd wiki-editor
start "Wiki Editor" cmd /c "npm start"

echo.
echo ================================================
echo SYSTEM READY!
echo ================================================
echo.
echo Students edit at:    http://localhost:3000
echo Live wiki at:        http://localhost:8080
echo.
echo Both systems are now running!
echo - Students save in the editor (port 3000)
echo - Changes appear automatically in Quartz (port 8080)
echo.
echo Press any key to stop both servers...
pause

echo Stopping servers...
taskkill /f /im node.exe 2>nul
echo Done.