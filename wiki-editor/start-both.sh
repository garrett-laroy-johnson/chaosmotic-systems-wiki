#!/bin/bash

echo "Starting Chaosmotic Systems Wiki - Complete System"
echo "================================================"
echo

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed!"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Navigate to the parent directory
cd ..

echo "Starting Quartz preview server on port 8080..."
echo "This will show the final wiki website"
npx quartz build --serve &
QUARTZ_PID=$!

echo
echo "Waiting for Quartz to start..."
sleep 5

echo "Starting Wiki Editor on port 3000..."
echo "This is where students will edit content"
cd wiki-editor
npm start &
EDITOR_PID=$!

echo
echo "================================================"
echo "SYSTEM READY!"
echo "================================================"
echo
echo "Students edit at:    http://localhost:3000"
echo "Live wiki at:        http://localhost:8080"
echo
echo "Both systems are now running!"
echo "- Students save in the editor (port 3000)"
echo "- Changes appear automatically in Quartz (port 8080)"
echo
echo "Press Ctrl+C to stop both servers..."

# Wait for interrupt signal
trap "echo 'Stopping servers...'; kill $QUARTZ_PID $EDITOR_PID 2>/dev/null; exit 0" INT
wait