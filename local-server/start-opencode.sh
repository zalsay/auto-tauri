#!/bin/bash
# start-opencode.sh - Start the Opencode HTTP server
# This script builds and runs the opencode-server Go application

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
OPENCODE_SERVER_DIR="$PROJECT_ROOT/opencode-server"

echo "🚀 Starting Opencode Server..."

# Check if Go is installed
if ! command -v go &> /dev/null; then
    echo "❌ Go is not installed. Please install Go first."
    exit 1
fi

# Check if directory exists
if [ ! -d "$OPENCODE_SERVER_DIR" ]; then
    echo "❌ opencode-server directory not found at: $OPENCODE_SERVER_DIR"
    exit 1
fi

cd "$OPENCODE_SERVER_DIR"

# Check if binary exists and is up to date, or build it
if [ ! -f "./opencode-server" ] || [ "main.go" -nt "./opencode-server" ]; then
    echo "📦 Building opencode-server..."
    go build -o opencode-server .
fi

echo "✅ Starting server on port 4096..."
echo "   Health check: http://127.0.0.1:4096/health"
echo "   Press Ctrl+C to stop"
echo ""

./opencode-server
