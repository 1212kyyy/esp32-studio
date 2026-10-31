const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws/serial' });
const PORT = process.env.PORT || 3456;
const SKETCHES_DIR = path.join(__dirname, 'sketches');
const CLI = process.env.ARDUINO_CLI_PATH || 'arduino-cli';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
if (!fs.existsSync(SKETCHES_DIR)) fs.mkdirSync(SKETCHES_DIR, { recursive: true });

app.get('/api/sketches', (req, res) => {
  try {
    const dirs = fs.readdirSync(SKETCHES_DIR).filter(f => fs.statSync(path.join(SKETCHES_DIR, f)).isDirectory());
    const sketches = dirs.map(n => {
      const fp = path.join(SKETCHES_DIR, n, n + '.ino');
      const s = fs.existsSync(fp) ? fs.statSync(fp) : null;
      return { name: n, modified: s ? s.mtime : null, size: s ? s.size : 0 };
    });
    res.json({ success: true, sketches });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/sketches/:name', (req, res) => {
  const fp = path.join(SKETCHES_DIR, req.params.name, req.params.name + '.ino');
  if (!fs.existsSync(fp)) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({ success: true, name: req.params.name, content: fs.readFileSync(fp, 'utf-8') });
});

app.post('/api/sketches/:name', (req, res) => {
  try {
    const dir = path.join(SKETCHES_DIR, req.params.name);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, req.params.name + '.ino'), req.body.content, 'utf-8');
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.delete('/api/sketches/:name', (req, res) => {
  const dir = path.join(SKETCHES_DIR, req.params.name);
  if (!fs.existsSync(dir)) return res.status(404).json({ success: false, error: 'Not found' });
  fs.rmSync(dir, { recursive: true, force: true });
  res.json({ success: true });
});

app.post('/api/compile', (req, res) => {
  const { sketchName, board } = req.body;
  const fqbn = board || 'esp32:esp32:esp32';
  const dir = path.join(SKETCHES_DIR, sketchName);
  if (!fs.existsSync(path.join(dir, sketchName + '.ino')))
    return res.status(404).json({ success: false, error: 'Sketch not found' });
  const bd = path.join(dir, 'build');
  if (!fs.existsSync(bd)) fs.mkdirSync(bd, { recursive: true });
  exec(`${CLI} compile --fqbn ${fqbn} --output-dir "${bd}" "${dir}"`, { timeout: 120000 }, (err, out, stderr) => {
    if (err) return res.json({ success: false, error: stderr || err.message, output: out });
    const bins = fs.readdirSync(bd).filter(f => f.endsWith('.bin'));
    res.json({ success: true, output: out, warnings: stderr, binFile: bins[0] || null });
  });
});

app.post('/api/upload/ota', (req, res) => {
  const { sketchName, espIp, espPort } = req.body;
  const bd = path.join(SKETCHES_DIR, sketchName, 'build');
  if (!fs.existsSync(bd)) return res.status(400).json({ success: false, error: 'Compile first!' });
  const bins = fs.readdirSync(bd).filter(f => f.endsWith('.bin'));
  if (!bins.length) return res.status(400).json({ success: false, error: 'No .bin found' });
  const fileData = fs.readFileSync(path.join(bd, bins[0]));
  const bnd = '----ESP32OTA';
  const hdr = Buffer.from(`--${bnd}\r\nContent-Disposition: form-data; name="firmware"; filename="firmware.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`);
  const ftr = Buffer.from(`\r\n--${bnd}--\r\n`);
  const body = Buffer.concat([hdr, fileData, ftr]);
  const r = http.request({
    hostname: espIp, port: espPort || 3232, path: '/update', method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${bnd}`, 'Content-Length': body.length },
    timeout: 60000
  }, (resp) => {
    let d = ''; resp.on('data', c => d += c);
    resp.on('end', () => res.json({ success: true, output: 'OTA OK: ' + d }));
  });
  r.on('error', e => res.json({ success: false, error: 'OTA failed: ' + e.message }));
  r.on('timeout', () => { r.destroy(); res.json({ success: false, error: 'OTA timeout' }); });
  r.write(body); r.end();
});

app.get('/api/boards', (req, res) => {
  exec(`${CLI} board listall --format json`, (err, out) => {
    if (err) return res.json({ success: true, boards: [
      { name: 'ESP32 Dev Module', fqbn: 'esp32:esp32:esp32' },
      { name: 'ESP32-S2', fqbn: 'esp32:esp32:esp32s2' },
      { name: 'ESP32-S3', fqbn: 'esp32:esp32:esp32s3' },
      { name: 'ESP32-C3', fqbn: 'esp32:esp32:esp32c3' },
      { name: 'NodeMCU-32S', fqbn: 'esp32:esp32:nodemcu-32s' }
    ]});
    try { res.json({ success: true, boards: JSON.parse(out).boards || [] }); }
    catch { res.json({ success: true, boards: [] }); }
  });
});

app.get('/api/status', (req, res) => {
  exec(`${CLI} version`, (err, out) => {
    if (err) return res.json({ success: true, arduinoCli: false });
    res.json({ success: true, arduinoCli: true, version: out.trim() });
  });
});

// Download compiled .bin for USB flash
app.get('/api/download/:name', (req, res) => {
  const bd = path.join(SKETCHES_DIR, req.params.name, 'build');
  if (!fs.existsSync(bd)) return res.status(400).json({ success: false, error: 'Compile first!' });
  const bins = fs.readdirSync(bd).filter(f => f.endsWith('.bin'));
  if (!bins.length) return res.status(400).json({ success: false, error: 'No .bin found' });
  res.download(path.join(bd, bins[0]), bins[0]);
});

const templates = require('./templates');
app.get('/api/templates', (req, res) => res.json({ success: true, templates }));

let serialPort = null;
wss.on('connection', (ws) => {
  ws.on('message', (msg) => {
    try {
      const d = JSON.parse(msg);
      if (d.action === 'open') {
        try {
          const { SerialPort } = require('serialport');
          const { ReadlineParser } = require('@serialport/parser-readline');
          if (serialPort && serialPort.isOpen) serialPort.close();
          serialPort = new SerialPort({ path: d.port, baudRate: parseInt(d.baudRate || 115200) });
          const parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));
          serialPort.on('open', () => ws.send(JSON.stringify({ type: 'status', message: 'Connected to ' + d.port })));
          parser.on('data', (line) => ws.send(JSON.stringify({ type: 'data', message: line })));
          serialPort.on('error', (e) => ws.send(JSON.stringify({ type: 'error', message: e.message })));
          serialPort.on('close', () => ws.send(JSON.stringify({ type: 'status', message: 'Port closed' })));
        } catch (e) { ws.send(JSON.stringify({ type: 'error', message: 'Serial: ' + e.message })); }
      } else if (d.action === 'close' && serialPort && serialPort.isOpen) {
        serialPort.close();
      } else if (d.action === 'send' && serialPort && serialPort.isOpen) {
        serialPort.write(d.text + '\n');
      }
    } catch (e) { ws.send(JSON.stringify({ type: 'error', message: e.message })); }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\nðŸš€ ESP32 IDE Server running at:');
  console.log('   Local:   http://localhost:' + PORT);
  const ni = require('os').networkInterfaces();
  Object.values(ni).forEach(i => i.forEach(a => {
    if (a.family === 'IPv4' && !a.internal) console.log('   Network: http://' + a.address + ':' + PORT);
  }));
  console.log('\nðŸ“± Buka URL ini di HP kamu untuk pakai ESP32 IDE!\n');
});
