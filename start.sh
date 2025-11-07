#!/bin/bash
echo "Starting Chaosmotic Wiki Editor..."
cd wiki-editor
npm install
echo "Starting test server..."
node test-server.js