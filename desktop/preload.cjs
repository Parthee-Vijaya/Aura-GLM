const { contextBridge, ipcRenderer } = require('electron');
const methods = {
  deploymentState: 'deployment:state', deploymentReview: 'deployment:review', deploymentSend: 'deployment:send', deploymentCheck: 'deployment:check', deploymentOpen: 'deployment:open',
  preferencesGet: 'preferences:get', preferencesSave: 'preferences:save', clearAssets: 'designs:clear',
  hostingState: 'hosting:state', hostingToken: 'hosting:token', hostingLogin: 'hosting:login', hostingPoll: 'hosting:poll', hostingCancel: 'hosting:cancel', hostingBrowser: 'hosting:browser', hostingDisconnect: 'hosting:disconnect', hostingCatalog: 'hosting:catalog', hostingCreate: 'hosting:create', hostingAttach: 'hosting:attach', hostingReview: 'hosting:review', hostingPush: 'hosting:push', hostingOpen: 'hosting:open',
  setupStatus: 'setup:status',
  gitStatus: 'git:status', gitInit: 'git:init', gitReview: 'git:review', gitCommit: 'git:commit', gitAutomatic: 'git:automatic',
  listDesigns: 'designs:list', saveDesign: 'designs:save', applyDesign: 'designs:apply',
  createProject: 'project:create', openProject: 'project:open', newProject: 'project:new', chooseAssets: 'assets:choose', removeAsset: 'assets:remove', revision: 'preview:revision', attachPreview: 'preview:attach',
  connectionState: 'connections:state', saveConnection: 'connections:save', removeConnection: 'connections:remove', models: 'connections:models', routes: 'connections:routes',
  prepare: 'agent:prepare', send: 'agent:send', stop: 'agent:stop', reply: 'agent:reply', question: 'agent:question', changes: 'agent:changes', skills: 'skills:list', saveSkill: 'skills:save'
};
const api = Object.fromEntries(Object.entries(methods).map(([name, channel]) => [name, value => ipcRenderer.invoke(channel, value)]));
api.onEvent = callback => { const listener = (_event, value) => callback(value); ipcRenderer.on('harness:event', listener); return () => ipcRenderer.removeListener('harness:event', listener); };
contextBridge.exposeInMainWorld('harness', api);
