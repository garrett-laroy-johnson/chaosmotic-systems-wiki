#!/bin/bash

echo "Starting Chaosmotic Systems Wiki Editor..."
echo

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed!"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "Error: Please run this script from the wiki-editor directory"
    exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "Error: Failed to install dependencies"
        exit 1
    fi
fi

# Check if users.json exists
if [ ! -f "users.json" ]; then
    echo
    echo "No users found. Running setup..."
    echo
    npm run setup
    if [ $? -ne 0 ]; then
        echo "Error: Setup failed"
        exit 1
    fi
fi

echo
echo "Starting server..."
echo "Wiki editor will be available at: http://localhost:3000"
echo "Press Ctrl+C to stop the server"
echo

npm start