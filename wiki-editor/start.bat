@echo off
echo Starting Chaosmotic Systems Wiki Editor...
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo Error: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if we're in the right directory
if not exist "package.json" (
    echo Error: Please run this script from the wiki-editor directory
    pause
    exit /b 1
)

REM Install dependencies if needed
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo Error: Failed to install dependencies
        pause
        exit /b 1
    )
)

REM Check if users.json exists
if not exist "users.json" (
    echo.
    echo No users found. Running setup...
    echo.
    call npm run setup
    if errorlevel 1 (
        echo Error: Setup failed
        pause
        exit /b 1
    )
)

echo.
echo Starting server...
echo Wiki editor will be available at: http://localhost:3000
echo Press Ctrl+C to stop the server
echo.

npm start