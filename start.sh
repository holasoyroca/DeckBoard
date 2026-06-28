#!/bin/bash
# Make sure server script is executable
chmod +x "$(dirname "$0")/server.py"

# Run the python server
python3 "$(dirname "$0")/server.py"
