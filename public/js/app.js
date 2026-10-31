/* ============ ESP32 Studio â€” PRO MAX JS ============ */
let editor, currentSketch='untitled', ws=null, serialConnected=false, panelCollapsed=false;
let uploadMode='wifi'; // 'wifi' or 'usb'
let usbPort=null; // Web Serial port
let usbReader=null, usbWriter=null;
let serverBaseUrl=location.protocol==='file:'||location.hostname==='localhost'||location.hostname===''?'http://'+location.hostname+(location.port?':'+location.port:''):'';

function api(path){
  if(serverBaseUrl) return serverBaseUrl.replace(/\/+$/,'') + path;
  return path;
}

function updateServerUrl(){
  const val=document.getElementById('serverHostInput').value.trim();
  if(val){
    serverBaseUrl=val.replace(/\/+$/,'');
    if(!serverBaseUrl.startsWith('http://')&&!serverBaseUrl.startsWith('https://')){
      serverBaseUrl='http://'+serverBaseUrl;
    }
  } else {
    serverBaseUrl=location.origin&&location.origin!=='null'&&location.protocol!=='file:'?location.origin:'';
  }
  saveSettings();
  loadSketches();
  loadTemplates();
  loadBoards();
  checkStatus();
}

document.addEventListener('DOMContentLoaded',()=>{
  initEditor(); loadSketches(); loadTemplates(); loadBoards(); checkStatus(); loadSettings(); initResizer();
});

function initEditor(){
  editor=CodeMirror.fromTextArea(document.getElementById('codeEditor'),{
    mode:'text/x-csrc', theme:'material-darker',
    lineNumbers:true, matchBrackets:true, autoCloseBrackets:true,
    styleActiveLine:true, indentUnit:2, tabSize:2, indentWithTabs:false,
    lineWrapping:false,
    extraKeys:{'Ctrl-S':()=>saveSketch(),'Cmd-S':()=>saveSketch()}
  });
  editor.setValue(
    '// ESP32 Sketch\n#include <Arduino.h>\n\nvoid setup() {\n  Serial.begin(115200);\n  Serial.println("Hello ESP32!");\n}\n\nvoid loop() {\n  delay(1000);\n}\n'
  );
}

/* ---- Sidebar ---- */
function toggleSidebar(){document.getElementById('drawer').classList.toggle('open')}

/* ---- Sketches ---- */
async function loadSketches(){
  try{
    const r=await fetch(api('/api/sketches'));const d=await r.json();
    const el=document.getElementById('sketchList');
    if(!d.sketches||!d.sketches.length){el.innerHTML='<div class="empty-state">No sketches yet</div>';return}
    el.innerHTML=d.sketches.map(s=>
      '<div class="sketch-item" onclick="openSketch(\''+s.name+'\')">'+
      '<div class="si-icon"><i class="fas fa-file-code"></i></div>'+
      '<div class="si-name">'+s.name+'</div>'+
      '<button class="si-del" onclick="event.stopPropagation();deleteSketch(\''+s.name+'\')"><i class="fas fa-trash-can"></i></button></div>'
    ).join('');
  }catch(e){log('Error loading sketches: '+e.message,'error')}
}

async function openSketch(name){
  try{
    const r=await fetch(api('/api/sketches/'+name));const d=await r.json();
    if(d.success){editor.setValue(d.content);currentSketch=name;updateFileName(name);toggleSidebar();log('Opened: '+name,'info')}
  }catch(e){log('Error: '+e.message,'error')}
}

async function saveSketch(){
  if(currentSketch==='untitled'){newSketch();return}
  try{
    setStatus('busy');
    const r=await fetch(api('/api/sketches/'+currentSketch),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:editor.getValue()})});
    const d=await r.json();
    if(d.success){toast('Saved âœ“');log('Saved: '+currentSketch,'success');setStatus('ok');saveSettings();loadSketches()}
    else{log('Save error: '+d.error,'error');setStatus('error')}
  }catch(e){log('Save error: '+e.message,'error');setStatus('error')}
}

async function deleteSketch(name){
  if(!confirm('Delete "'+name+'"?'))return;
  await fetch(api('/api/sketches/'+name),{method:'DELETE'});
  toast('Deleted');log('Deleted: '+name,'warn');loadSketches();
  if(currentSketch===name){currentSketch='untitled';updateFileName('untitled');editor.setValue('')}
}

function newSketch(){showModal('newSketchModal');document.getElementById('newSketchName').value='';setTimeout(()=>document.getElementById('newSketchName').focus(),100)}

async function createSketch(){
  const raw=document.getElementById('newSketchName').value.trim();
  if(!raw){toast('Enter a name!');return}
  currentSketch=raw.replace(/[^a-zA-Z0-9_-]/g,'_');updateFileName(currentSketch);
  closeModal('newSketchModal');await saveSketch();toggleSidebar();
}

/* ---- Templates ---- */
async function loadTemplates(){
  try{
    const r=await fetch(api('/api/templates'));const d=await r.json();
    const el=document.getElementById('templateList');
    el.innerHTML=d.templates.map(t=>
      '<div class="sketch-item" onclick="loadTemplate(\''+t.name+'\')">'+
      '<div class="si-icon" style="color:var(--orange)"><i class="fas fa-shapes"></i></div>'+
      '<div><div class="si-name">'+t.name+'</div><div class="si-desc">'+t.description+'</div></div></div>'
    ).join('');
    window._tpl=d.templates;
  }catch(e){log('Error loading templates','error')}
}

function loadTemplate(name){
  const t=window._tpl.find(x=>x.name===name);
  if(t){editor.setValue(t.code);currentSketch=name;updateFileName(name);toggleSidebar();log('Template: '+name,'info')}
}

/* ---- Compile ---- */
async function compileSketch(){
  if(currentSketch==='untitled'){toast('Save first!');newSketch();return}
  await saveSketch(); setStatus('busy'); log('Compiling '+currentSketch+'â€¦','info');
  try{
    const board=document.getElementById('boardSelect').value;
    const r=await fetch(api('/api/compile'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sketchName:currentSketch,board})});
    const d=await r.json();
    if(d.success){toast('Build OK âœ“');log('âœ… Build successful','success');if(d.output)log(d.output,'success');if(d.binFile)log('Binary: '+d.binFile,'info');setStatus('ok')}
    else{toast('Build failed');log('âŒ Build failed','error');if(d.error)log(d.error,'error');if(d.output)log(d.output,'warn');setStatus('error')}
  }catch(e){log('Compile error: '+e.message,'error');setStatus('error')}
}


/* ---- Upload (WiFi OTA + USB) ---- */
async function uploadSketch(){
  if(currentSketch==='untitled'){toast('Save first!');return}
  if(uploadMode==='usb') return uploadUSB();
  return uploadWifi();
}

async function uploadWifi(){
  const ip=document.getElementById('espIpInput').value.trim();
  if(!ip){toast('Set ESP32 IP first!');toggleSidebar();return}
  await saveSketch();log('Building before flash...','info');setStatus('busy');
  try{
    const board=document.getElementById('boardSelect').value;
    const cr=await fetch(api('/api/compile'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sketchName:currentSketch,board})});
    const cd=await cr.json();
    if(!cd.success){log('Build failed','error');if(cd.error)log(cd.error,'error');setStatus('error');return}
    log('Built! Flashing to '+ip+'...','info');
    showModal('uploadModal');
    document.getElementById('uploadModalTitle').textContent='WiFi OTA Flash';
    document.getElementById('uploadModalIcon').className='fas fa-wifi';
    document.getElementById('uploadStatus').textContent='Uploading to '+ip+'...';
    document.getElementById('uploadProgressFill').style.width='50%';
    const port=document.getElementById('espPortInput').value||'3232';
    const ur=await fetch(api('/api/upload/ota'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sketchName:currentSketch,espIp:ip,espPort:port})});
    const ud=await ur.json();
    document.getElementById('uploadProgressFill').style.width='100%';
    if(ud.success){document.getElementById('uploadStatus').textContent='Flash complete!';toast('Flash OK');log('Flash complete!','success');setStatus('ok')}
    else{document.getElementById('uploadStatus').textContent='Failed';log('Flash failed: '+ud.error,'error');setStatus('error')}
  }catch(e){log('Upload error: '+e.message,'error');setStatus('error')}
}

async function uploadUSB(){
  if(!usbPort){toast('Connect ESP32 via USB first!');toggleSidebar();return}
  await saveSketch();log('Building for USB flash...','info');setStatus('busy');
  try{
    const board=document.getElementById('boardSelect').value;
    const cr=await fetch(api('/api/compile'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sketchName:currentSketch,board})});
    const cd=await cr.json();
    if(!cd.success){log('Build failed','error');if(cd.error)log(cd.error,'error');setStatus('error');return}
    log('Built! Downloading .bin...','info');
    showModal('uploadModal');
    document.getElementById('uploadModalTitle').textContent='USB Flash';
    document.getElementById('uploadModalIcon').className='fas fa-usb';
    document.getElementById('uploadStatus').textContent='Downloading firmware...';
    document.getElementById('uploadProgressFill').style.width='20%';
    const logEl=document.getElementById('uploadLog');logEl.innerHTML='';logEl.classList.add('show');
    addUploadLog('Downloading compiled binary...');
    const binResp=await fetch(api('/api/download/'+currentSketch));
    if(!binResp.ok)throw new Error('Failed to download .bin');
    const binData=await binResp.arrayBuffer();
    addUploadLog('Binary size: '+(binData.byteLength/1024).toFixed(1)+' KB');
    document.getElementById('uploadProgressFill').style.width='40%';
    document.getElementById('uploadStatus').textContent='Flashing via USB...';
    addUploadLog('Entering bootloader mode...');
    await flashViaUSB(new Uint8Array(binData));
  }catch(e){document.getElementById('uploadStatus').textContent='Error: '+e.message;log('USB error: '+e.message,'error');setStatus('error')}
}

function addUploadLog(msg){const el=document.getElementById('uploadLog');const p=document.createElement('p');p.textContent='> '+msg;el.appendChild(p);el.scrollTop=el.scrollHeight}

/* ---- USB Web Serial ---- */
function setUploadMode(mode){
  uploadMode=mode;
  document.getElementById('modeWifi').classList.toggle('active',mode==='wifi');
  document.getElementById('modeUsb').classList.toggle('active',mode==='usb');
  document.getElementById('wifiConfig').style.display=mode==='wifi'?'block':'none';
  document.getElementById('usbConfig').style.display=mode==='usb'?'block':'none';
  saveSettings();
  if(mode==='usb'&&!('serial' in navigator)){
    toast('Web Serial not supported!');
    log('Web Serial API requires Chrome/Edge 89+','warn');
  }
}

async function connectUSB(){
  if(!('serial' in navigator)){toast('Web Serial not supported!');return}
  try{
    if(usbPort){try{if(usbReader){usbReader.cancel();usbReader=null}await usbPort.close()}catch(e){}}
    usbPort=await navigator.serial.requestPort({filters:[
      {usbVendorId:0x10C4},{usbVendorId:0x1A86},
      {usbVendorId:0x0403},{usbVendorId:0x303A}
    ]});
    await usbPort.open({baudRate:115200});
    const info=usbPort.getInfo();
    document.getElementById('usbStatusCard').classList.add('connected');
    document.getElementById('usbStatusText').textContent='Connected (VID:'+hex(info.usbVendorId)+')';
    toast('ESP32 USB connected!');
    log('USB: VID:'+hex(info.usbVendorId)+' PID:'+hex(info.usbProductId),'success');
    startUSBSerial();
  }catch(e){if(e.name!=='NotFoundError')log('USB: '+e.message,'error')}
}

function hex(n){return n?'0x'+n.toString(16).toUpperCase():'?'}

async function startUSBSerial(){
  if(!usbPort||!usbPort.readable)return;
  const dec=new TextDecoderStream();
  usbPort.readable.pipeTo(dec.writable).catch(()=>{});
  usbReader=dec.readable.getReader();
  try{
    while(true){
      const{value,done}=await usbReader.read();
      if(done)break;
      if(value)value.split('\n').filter(l=>l.trim()).forEach(l=>logSerial(l.replace(/\r/g,'')));
    }
  }catch(e){}
}

async function flashViaUSB(binData){
  addUploadLog('Resetting ESP32 into bootloader...');
  document.getElementById('uploadProgressFill').style.width='50%';
  try{
    await usbPort.close();
    await usbPort.open({baudRate:115200});
    await usbPort.setSignals({dataTerminalReady:false,requestToSend:true});
    await sleep(100);
    await usbPort.setSignals({dataTerminalReady:true,requestToSend:false});
    await sleep(50);
    await usbPort.setSignals({dataTerminalReady:false,requestToSend:false});
    await sleep(500);
    addUploadLog('Sending sync...');
    const w=usbPort.writable.getWriter();
    const sync=new Uint8Array([0xC0,0x00,0x08,0x24,0x00,0x00,0x00,0x00,0x00,0x07,0x07,0x12,0x20,
      0x55,0x55,0x55,0x55,0x55,0x55,0x55,0x55,0x55,0x55,0x55,0x55,0x55,0x55,0x55,0x55,
      0x55,0x55,0x55,0x55,0x55,0x55,0x55,0x55,0x55,0x55,0x55,0x55,0x55,0x55,0x55,0x55,0xC0]);
    for(let i=0;i<5;i++){await w.write(sync);await sleep(100)}
    w.releaseLock();
    addUploadLog('Binary ready ('+binData.byteLength+' bytes)');
    addUploadLog('For full USB flash, also install esptool:');
    addUploadLog('  pip install esptool');
    addUploadLog('  esptool.py write_flash 0x10000 firmware.bin');
    addUploadLog('Or upload HTTP_OTA_Server template via USB once,');
    addUploadLog('then use WiFi OTA mode for wireless uploads!');
    document.getElementById('uploadProgressFill').style.width='100%';
    document.getElementById('uploadStatus').textContent='Binary compiled â€” see log';
    log('Binary ready. Use esptool for first flash, then WiFi OTA.','warn');
    setStatus('ok');
    await usbPort.close();await usbPort.open({baudRate:115200});startUSBSerial();
  }catch(e){addUploadLog('Error: '+e.message);throw e}
}

function sleep(ms){return new Promise(r=>setTimeout(r,ms))}

/* ---- Serial Monitor ---- */
function toggleSerial(){serialConnected?disconnectSerial():connectSerial()}

function connectSerial(){
  const port=document.getElementById('serialPort').value;
  const baud=document.getElementById('serialBaud').value;
  if(!port){toast('Select a port first');return}
  const wsUrl=serverBaseUrl ? serverBaseUrl.replace(/^http/, 'ws') + '/ws/serial' : (location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'/ws/serial';
  ws=new WebSocket(wsUrl);
  ws.onopen=()=>{
    ws.send(JSON.stringify({action:'open',port,baudRate:parseInt(baud)}));
    serialConnected=true;
    const btn=document.getElementById('serialConnectBtn');
    btn.innerHTML='<i class="fas fa-plug-circle-xmark"></i> Disconnect';
    btn.classList.add('connected');
    logSerial('Connecting to '+port+'â€¦','info');
  };
  ws.onmessage=(e)=>{const d=JSON.parse(e.data);if(d.type==='data')logSerial(d.message);else if(d.type==='status')logSerial(d.message,'success');else if(d.type==='error')logSerial(d.message,'error')};
  ws.onclose=()=>{serialConnected=false;const btn=document.getElementById('serialConnectBtn');btn.innerHTML='<i class="fas fa-plug-circle-bolt"></i> Connect';btn.classList.remove('connected')};
  ws.onerror=()=>logSerial('Connection error','error');
}
function disconnectSerial(){if(ws){ws.send(JSON.stringify({action:'close'}));ws.close()}}
function sendSerial(){const inp=document.getElementById('serialInput');if(ws&&serialConnected&&inp.value){ws.send(JSON.stringify({action:'send',text:inp.value}));logSerial('â€º '+inp.value,'warn');inp.value=''}}
function logSerial(msg,type){const out=document.getElementById('serialOutput');const p=document.createElement('p');p.textContent=msg;if(type)p.classList.add('c-'+type);out.appendChild(p);out.scrollTop=out.scrollHeight}

/* ---- Boards / Status ---- */
async function loadBoards(){try{const r=await fetch(api('/api/boards'));const d=await r.json();document.getElementById('boardSelect').innerHTML=d.boards.map(b=>'<option value="'+b.fqbn+'">'+b.name+'</option>').join('')}catch(e){}}

async function checkStatus(){
  try{const r=await fetch(api('/api/status'));const d=await r.json();const el=document.getElementById('cliStatus');
    if(d.arduinoCli)el.innerHTML='<i class="fas fa-circle-check" style="color:var(--green)"></i> '+d.version;
    else el.innerHTML='<i class="fas fa-triangle-exclamation" style="color:var(--orange)"></i> Arduino CLI not found â€” <a href="https://arduino.github.io/arduino-cli/" target="_blank" style="color:var(--accent-l)">Install</a>';
  }catch(e){document.getElementById('cliStatus').innerHTML='<i class="fas fa-circle-xmark" style="color:var(--red)"></i> Server error'}
}

function updateFileName(n){document.getElementById('currentSketchName').textContent=n}
function setStatus(s){document.getElementById('statusDot').className='status-indicator'+(s==='ok'?'':' '+s)}

function log(msg,type){
  const out=document.getElementById('consoleOutput');const p=document.createElement('p');
  const ts=new Date().toLocaleTimeString('en',{hour12:false});
  p.innerHTML='<span class="c-dim">['+ts+']</span> '+msg.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  if(type)p.classList.add('c-'+type);out.appendChild(p);out.scrollTop=out.scrollHeight;switchTab('console');
}
function clearConsole(){const isC=!document.getElementById('consolePanel').classList.contains('hidden');document.getElementById(isC?'consoleOutput':'serialOutput').innerHTML=''}
function switchTab(tab){
  document.getElementById('tabConsole').classList.toggle('active',tab==='console');
  document.getElementById('tabSerial').classList.toggle('active',tab==='serial');
  document.getElementById('consolePanel').classList.toggle('hidden',tab!=='console');
  document.getElementById('serialPanel').classList.toggle('hidden',tab!=='serial');
}
function togglePanel(){
  panelCollapsed=!panelCollapsed;
  document.getElementById('bottomPanel').classList.toggle('collapsed',panelCollapsed);
  document.getElementById('panelToggleIcon').className=panelCollapsed?'fas fa-chevron-up':'fas fa-chevron-down';
  setTimeout(()=>editor.refresh(),350);
}
function showModal(id){document.getElementById(id).classList.add('open')}
function closeModal(id){document.getElementById(id).classList.remove('open');document.getElementById('uploadProgressFill').style.width='0%';document.getElementById('uploadLog').classList.remove('show')}

function toast(msg){
  let t=document.querySelector('.toast');
  if(!t){t=document.createElement('div');t.className='toast';document.body.appendChild(t)}
  t.textContent=msg;t.classList.add('show');clearTimeout(t._tid);t._tid=setTimeout(()=>t.classList.remove('show'),2200);
}

function initResizer(){
  const resizer=document.getElementById('panelResizer'),panel=document.getElementById('bottomPanel');let sy,sh;
  const onMove=e=>{const y=e.touches?e.touches[0].clientY:e.clientY;panel.style.height=Math.max(80,Math.min(window.innerHeight*.6,sh+(sy-y)))+'px'};
  const onUp=()=>{document.removeEventListener('mousemove',onMove);document.removeEventListener('touchmove',onMove);document.removeEventListener('mouseup',onUp);document.removeEventListener('touchend',onUp);editor.refresh()};
  resizer.addEventListener('mousedown',e=>{sy=e.clientY;sh=panel.offsetHeight;document.addEventListener('mousemove',onMove);document.addEventListener('mouseup',onUp)});
  resizer.addEventListener('touchstart',e=>{sy=e.touches[0].clientY;sh=panel.offsetHeight;document.addEventListener('touchmove',onMove);document.addEventListener('touchend',onUp)},{passive:true});
}

function saveSettings(){
  localStorage.setItem('esp32ide_s',JSON.stringify({
    ip:document.getElementById('espIpInput').value,
    port:document.getElementById('espPortInput').value,
    board:document.getElementById('boardSelect').value,
    sk:currentSketch,
    mode:uploadMode,
    server:document.getElementById('serverHostInput')?document.getElementById('serverHostInput').value:''
  }));
}

function loadSettings(){
  try{
    const s=JSON.parse(localStorage.getItem('esp32ide_s'));
    if(s){
      if(s.server&&document.getElementById('serverHostInput')){
        document.getElementById('serverHostInput').value=s.server;
        serverBaseUrl=s.server;
      }
      if(s.ip)document.getElementById('espIpInput').value=s.ip;
      if(s.port)document.getElementById('espPortInput').value=s.port;
      if(s.board)document.getElementById('boardSelect').value=s.board;
      if(s.mode)setUploadMode(s.mode);
      if(s.sk&&s.sk!=='untitled')openSketch(s.sk);
    }
  }catch(e){}
}

if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
