#!/bin/bash

# hdisplay Raspberry Pi Setup Script
set -e

echo "Setting up hdisplay on Raspberry Pi..."

# Update system
sudo apt-get update

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Chromium if not present
sudo apt-get install -y chromium-browser

# Clone hdisplay
cd ~
git clone https://github.com/ewilderj/hdisplay.git
cd hdisplay
npm install

# Create systemd service for hdisplay server
sudo tee /etc/systemd/system/hdisplay.service > /dev/null <<EOF
[Unit]
Description=hdisplay Server
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/hdisplay
ExecStart=/usr/bin/node /home/pi/hdisplay/server/index.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

# Create autostart for Chromium kiosk
mkdir -p ~/.config/autostart
tee ~/.config/autostart/hdisplay-browser.desktop > /dev/null <<EOF
[Desktop Entry]
Type=Application
Name=hdisplay Browser
Exec=chromium-browser --kiosk --noerrdialogs --disable-infobars --window-size=1280,400 --window-position=0,0 http://localhost:3000
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
EOF

# Enable and start service
sudo systemctl enable hdisplay.service
sudo systemctl start hdisplay.service

echo "hdisplay setup complete!"
echo "Server running at http://localhost:3000"
echo "Use 'hdisplay' CLI to control the display"