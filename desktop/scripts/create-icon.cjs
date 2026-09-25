const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
app.whenReady().then(async () => {
 const window = new BrowserWindow({ width:1024,height:1024,show:false,transparent:true,webPreferences:{offscreen:true,nodeIntegration:false,contextIsolation:true} });
 await window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<body style="margin:0;background:transparent"><svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><rect x="48" y="48" width="928" height="928" rx="218" fill="#18332f"/><path d="M330 298v428M694 298v428M330 512h364" stroke="#e0f1d4" stroke-width="100" stroke-linecap="round"/></svg></body>'));
 await fs.writeFile(path.join(__dirname,'../packaging/icon.png'),(await window.webContents.capturePage()).toPNG());app.quit();
});
