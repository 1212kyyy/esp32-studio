module.exports = [
  {
    name: 'Blink',
    description: 'Blink built-in LED',
    code: '#define LED_PIN 2\n\nvoid setup() {\n  pinMode(LED_PIN, OUTPUT);\n  Serial.begin(115200);\n  Serial.println("Blink started!");\n}\n\nvoid loop() {\n  digitalWrite(LED_PIN, HIGH);\n  Serial.println("LED ON");\n  delay(1000);\n  digitalWrite(LED_PIN, LOW);\n  Serial.println("LED OFF");\n  delay(1000);\n}\n'
  },
  {
    name: 'WiFi_Connect',
    description: 'Connect to WiFi',
    code: '#include <WiFi.h>\n\nconst char* ssid = "YOUR_SSID";\nconst char* password = "YOUR_PASSWORD";\n\nvoid setup() {\n  Serial.begin(115200);\n  WiFi.begin(ssid, password);\n  Serial.print("Connecting");\n  while (WiFi.status() != WL_CONNECTED) {\n    delay(500);\n    Serial.print(".");\n  }\n  Serial.println("\\nConnected! IP: " + WiFi.localIP().toString());\n}\n\nvoid loop() { delay(1000); }\n'
  },
  {
    name: 'OTA_Basic',
    description: 'ArduinoOTA support',
    code: '#include <WiFi.h>\n#include <ArduinoOTA.h>\n\nconst char* ssid = "YOUR_SSID";\nconst char* password = "YOUR_PASSWORD";\n\nvoid setup() {\n  Serial.begin(115200);\n  WiFi.begin(ssid, password);\n  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }\n  Serial.println("\\nIP: " + WiFi.localIP().toString());\n  ArduinoOTA.setHostname("esp32-device");\n  ArduinoOTA.onStart([]() { Serial.println("OTA Start"); });\n  ArduinoOTA.onEnd([]() { Serial.println("\\nOTA Done!"); });\n  ArduinoOTA.onProgress([](unsigned int p, unsigned int t) {\n    Serial.printf("Progress: %u%%\\r", (p / (t / 100)));\n  });\n  ArduinoOTA.begin();\n  Serial.println("OTA Ready!");\n}\n\nvoid loop() { ArduinoOTA.handle(); }\n'
  },
  {
    name: 'MQTT_Basic',
    description: 'MQTT client for IoT',
    code: '#include <WiFi.h>\n#include <PubSubClient.h>\n\nconst char* ssid = "YOUR_SSID";\nconst char* password = "YOUR_PASSWORD";\nconst char* mqtt_server = "YOUR_MQTT_SERVER";\n\nWiFiClient espClient;\nPubSubClient client(espClient);\n\nvoid callback(char* topic, byte* payload, unsigned int length) {\n  Serial.print("Msg ["); Serial.print(topic); Serial.print("]: ");\n  for (int i = 0; i < length; i++) Serial.print((char)payload[i]);\n  Serial.println();\n}\n\nvoid reconnect() {\n  while (!client.connected()) {\n    if (client.connect("ESP32Client")) {\n      client.subscribe("esp32/input");\n    } else { delay(5000); }\n  }\n}\n\nvoid setup() {\n  Serial.begin(115200);\n  WiFi.begin(ssid, password);\n  while (WiFi.status() != WL_CONNECTED) { delay(500); }\n  client.setServer(mqtt_server, 1883);\n  client.setCallback(callback);\n}\n\nvoid loop() {\n  if (!client.connected()) reconnect();\n  client.loop();\n  static unsigned long last = 0;\n  if (millis() - last > 5000) {\n    last = millis();\n    client.publish("esp32/output", ("Hello " + String(millis()/1000) + "s").c_str());\n  }\n}\n'
  },
  {
    name: 'HTTP_OTA_Server',
    description: 'HTTP OTA update endpoint (untuk upload dari ESP32 IDE)',
    code: '#include <WiFi.h>\n#include <WebServer.h>\n#include <Update.h>\n\nconst char* ssid = "YOUR_SSID";\nconst char* password = "YOUR_PASSWORD";\n\nWebServer server(3232);\n\nvoid setup() {\n  Serial.begin(115200);\n  WiFi.begin(ssid, password);\n  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }\n  Serial.println("\\nIP: " + WiFi.localIP().toString());\n\n  server.on("/update", HTTP_POST, []() {\n    server.sendHeader("Connection", "close");\n    server.send(200, "text/plain", Update.hasError() ? "FAIL" : "OK");\n    delay(1000); ESP.restart();\n  }, []() {\n    HTTPUpload& upload = server.upload();\n    if (upload.status == UPLOAD_FILE_START) {\n      Serial.printf("Update: %s\\n", upload.filename.c_str());\n      if (!Update.begin(UPDATE_SIZE_UNKNOWN)) Update.printError(Serial);\n    } else if (upload.status == UPLOAD_FILE_WRITE) {\n      if (Update.write(upload.buf, upload.currentSize) != upload.currentSize)\n        Update.printError(Serial);\n    } else if (upload.status == UPLOAD_FILE_END) {\n      if (Update.end(true)) Serial.printf("Success: %u bytes\\n", upload.totalSize);\n      else Update.printError(Serial);\n    }\n  });\n\n  server.on("/", HTTP_GET, []() {\n    server.send(200, "text/html", "<h1>ESP32 OTA Ready</h1>");\n  });\n  server.begin();\n  Serial.println("OTA Server on port 3232");\n}\n\nvoid loop() { server.handleClient(); }\n'
  }
];
