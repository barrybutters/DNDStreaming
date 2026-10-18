const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {Obs}=require('../app/obs');
class Fake extends EventEmitter {
 async connect(){this.connected=true;}
 async disconnect(){this.connected=false;}
 async call(type){if(type==='GetSceneList')return {scenes:[{sceneName:'Game'}],currentProgramSceneName:'Game'};if(type==='GetInputList')return {inputs:[]};return {outputActive:false};}
}
test('OBS reconnect restores status but never queues failed actions',async()=>{
 const clients=[];const obs=new Obs({factory:()=>{const c=new Fake();clients.push(c);return c},retryBase:10});
 await obs.connect('ws://127.0.0.1:4455','secret');
 assert.equal(obs.status.connected,true);clients[0].emit('ConnectionClosed');
 await assert.rejects(obs.call('StartRecord'),/No command has been queued/);
 await new Promise(r=>setTimeout(r,30));assert.equal(clients.length,2);assert.equal(obs.status.connected,true);
 await obs.disconnect();assert.equal(obs.credentials,null);assert.equal(obs.retry,null);
});
test('OBS browser source setup speaks the actual JSON WebSocket protocol and avoids duplicate sources',async t=>{
 const {WebSocketServer}=require('ws');const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const {Service}=require('../app/service');
 const server=new WebSocketServer({port:0,host:'127.0.0.1'});await new Promise(r=>server.once('listening',r));
 const inputs=[];let creates=0;let source;
 server.on('connection',ws=>{
  ws.send(JSON.stringify({op:0,d:{obsWebSocketVersion:'5.5.0',rpcVersion:1}}));
  ws.on('message',raw=>{
   const message=JSON.parse(raw);
   if(message.op===1)return ws.send(JSON.stringify({op:2,d:{negotiatedRpcVersion:1}}));
   if(message.op!==6)return;
   const {requestType,requestId,requestData}=message.d;let responseData={};
   if(requestType==='GetSceneList')responseData={scenes:[{sceneName:'Game'}],currentProgramSceneName:'Game'};
   else if(requestType==='GetInputList')responseData={inputs};
   else if(['GetRecordStatus','GetStreamStatus'].includes(requestType))responseData={outputActive:false};
   else if(requestType==='CreateInput'){creates++;source=requestData;inputs.push({inputName:requestData.inputName});}
   else if(requestType==='GetInputSettings')responseData={inputSettings:source.inputSettings};
   ws.send(JSON.stringify({op:7,d:{requestType,requestId,requestStatus:{result:true,code:100},responseData}}));
  });
 });
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obs-protocol-'));const svc=new Service(dir);
 t.after(async()=>{await svc.close();for(const client of server.clients)client.terminate();await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});});
 await svc.listen(true);await svc.command('createCampaign',{name:'OBS'});
 await svc.obs.connect(`ws://127.0.0.1:${server.address().port}`,'');
 await svc.command('setupOverlay',{confirmed:true,scene:'Game'});
 assert.equal(source.inputSettings.url,svc.url+'/overlay');assert.equal(source.inputSettings.width,1920);
 assert.equal((await svc.command('setupOverlay',{confirmed:true,scene:'Game'})).existing,true);assert.equal(creates,1);
});
