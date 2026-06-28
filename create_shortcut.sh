#!/bin/bash
# Script to install DeckBoard desktop shortcut
DESKTOP_DIR="/home/deck/Desktop"
SHORTCUT_NAME="deckboard.desktop"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Write the desktop file
cat << EOF > "$DESKTOP_DIR/$SHORTCUT_NAME"
[Desktop Entry]
Name=DeckBoard
Comment=Start DeckBoard Web Dashboard
Exec=$PROJECT_DIR/start.sh
Icon=steam
Terminal=true
Type=Application
Categories=Utility;
EOF

# Make it executable
chmod +x "$DESKTOP_DIR/$SHORTCUT_NAME"

echo "============================================="
echo "  DECKBOARD SHORTCUT CREATED SUCCESSFULLY!   "
echo "============================================="
echo "  You can now start DeckBoard by double-tapping"
echo "  the 'DeckBoard' icon on your desktop."
echo "============================================="
