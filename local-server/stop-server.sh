#!/bin/bash

# Stop OpenCode Local Server

PORT=4096
PID=$(lsof -ti :$PORT)

if [ -n "$PID" ]; then
    echo "🛑 Stopping OpenCode server (PID: $PID)..."
    kill $PID
    echo "✅ Server stopped successfully"
else
    echo "ℹ️  No server running on port $PORT"
fi
