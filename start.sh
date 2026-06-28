#!/bin/bash
# DeckBoard Startup Script
# Version: 1.1.0
echo "Starting DeckBoard v1.1.0..."

# Make sure server script is executable
chmod +x "$(dirname "$0")/server.py"

# Run the python server
python3 "$(dirname "$0")/server.py"
