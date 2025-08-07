#!/usr/bin/env bash
set -euo pipefail

echo "[hdisplay] Raspberry Pi setup starting"

if ! command -v node >/dev/null 2>&1; then
  echo "Installing Node.js 18.x"
  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

if ! command -v chromium-browser >/dev/null 2>&1 && ! command -v chromium >/dev/null 2>&1; then
  echo "Installing Chromium"
  sudo apt-get update
  sudo apt-get install -y chromium-browser || sudo apt-get install -y chromium
fi

# Clone repo if not present
if [ ! -d "$HOME/hdisplay" ]; then
  git clone https://github.com/ewilderj/hdisplay.git "$HOME/hdisplay"
fi

cd "$HOME/hdisplay"
npm install

SERVICE_USER=${SUDO_USER:-$USER}
SERVICE_HOME=$(eval echo ~${SERVICE_USER})

sudo tee /etc/systemd/system/hdisplay.service > /dev/null <<EOF
[Unit]
Description=hdisplay Server
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${SERVICE_HOME}/hdisplay
ExecStart=$(command -v node) ${SERVICE_HOME}/hdisplay/server/index.js
Restart=on-failure
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
EOF

mkdir -p "${SERVICE_HOME}/.config/autostart"
BROWSER_CMD=$(command -v chromium-browser || command -v chromium)
cat > "${SERVICE_HOME}/.config/autostart/hdisplay-browser.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=hdisplay Browser
Exec=${BROWSER_CMD} --kiosk --noerrdialogs --disable-infobars --window-size=1280,400 --window-position=0,0 http://localhost:3000
Hidden=false
X-GNOME-Autostart-enabled=true
EOF

sudo systemctl daemon-reload
sudo systemctl enable hdisplay.service
sudo systemctl restart hdisplay.service

echo "[hdisplay] setup complete. Server on port 3000"
