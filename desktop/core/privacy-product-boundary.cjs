// SPDX-License-Identifier: EUPL-1.2
'use strict';
const {ExternalEgress}=require('./privacy/external-egress.cjs');
// These legacy handlers can launch a host CLI, browser or remote SDK. They do
// not yet have a complete immutable wire-artifact adapter. No generic consent
// or conversation YOLO grant is allowed to open them in a protected project.
const EXTERNAL = new Set(['links:open','support:feedback','updates:website','updates:notes','updates:check','updates:download','hosting:login','hosting:poll','hosting:token','hosting:browser','hosting:catalog','hosting:attach','deployment:guide-open','connections:account','komplai:login','komplai:publish-overview','komplai:publish-address','hosting:create','hosting:push','hosting:open','deployment:setup','deployment:setup-open','deployment:tracking','deployment:review','deployment:send','deployment:check','deployment:open','promte:preview-connect','promte:preview-login','promte:preview-create','promte:preview-fetch','komplai:preview-create','komplai:preview-call']);
async function authorize(channel,service,root) {
  if(!EXTERNAL.has(channel))return ()=>true;
  return new ExternalEgress(()=>service).legacyPermit(root);
}
module.exports={EXTERNAL,authorize};
