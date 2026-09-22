const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('harness', {
  createProject: input => ipcRenderer.invoke('project:create', input),
  openProject: () => ipcRenderer.invoke('project:open'),
  newProject: () => ipcRenderer.invoke('project:new'),
  chooseAssets: kind => ipcRenderer.invoke('assets:choose', kind),
  removeAsset: id => ipcRenderer.invoke('assets:remove', id),
  revision: () => ipcRenderer.invoke('preview:revision')
});
