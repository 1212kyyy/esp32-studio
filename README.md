# ESP32 IDE 🚀

Web-based Arduino IDE for ESP32 - accessible from your phone!

## Features
- 📝 Code Editor with syntax highlighting (C/C++ Arduino)
- ⚙️ Compile sketches using Arduino CLI
- 📤 OTA Upload to ESP32 via WiFi
- 📟 Serial Monitor via WebSocket
- 📁 Project/Sketch Manager
- 📱 PWA - Install on your phone like a native app
- 🎨 Dark theme, mobile-optimized

## Setup on Server

### 1. Install Node.js
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs
```

### 2. Install Arduino CLI
```bash
curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh
sudo mv bin/arduino-cli /usr/local/bin/
```

### 3. Setup ESP32 Board
```bash
arduino-cli config init
arduino-cli config add board_manager.additional_urls https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
arduino-cli core update-index
arduino-cli core install esp32:esp32
```

### 4. Install & Run ESP32 IDE
```bash
cd esp32-ide
npm install
npm start
```

Server will run at `http://YOUR_SERVER_IP:3456`

### 5. Open on Phone
Open the URL in your phone browser and tap "Add to Home Screen" to install as PWA.

## ESP32 OTA Setup
Upload the `HTTP_OTA_Server` template to your ESP32 first (via USB), then you can upload sketches wirelessly via this IDE.

## Architecture
```
Phone (Browser) ──→ Home Server (Node.js) ──→ ESP32 (OTA)
                     │
                     ├── Code Editor (CodeMirror)
                     ├── Arduino CLI (Compile)
                     ├── HTTP OTA Upload
                     └── Serial Monitor (WebSocket)
```

## Environment Variables
- `PORT` - Server port (default: 3456)
- `ARDUINO_CLI_PATH` - Path to arduino-cli (default: 'arduino-cli')
