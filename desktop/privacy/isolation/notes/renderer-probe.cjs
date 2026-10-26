const {app,BrowserWindow}=require('electron');
const path=require('node:path'),fs=require('node:fs/promises');
const root=process.argv.at(-1);
app.setPath('userData',path.join(root,'profile'));
app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,width:800,height:600,webPreferences:{offscreen:true,sandbox:true,nodeIntegration:false,contextIsolation:true}});
  await win.loadURL('data:text/html,<h1>Local renderer fixture</h1>');
  await fs.writeFile(path.join(root,'screenshot.png'),(await win.webContents.capturePage()).toPNG());
  app.exit(0);
}).catch(()=>app.exit(1));
