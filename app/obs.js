const { EventEmitter } = require('node:events');
class Obs extends EventEmitter {
  constructor({factory, retryBase=1000, retryMax=30000}={}) {
    super();
    this.factory=factory || (()=>new (require('obs-websocket-js/json').default)());
    this.retryBase=retryBase;this.retryMax=retryMax;this.generation=0;this.attempt=0;
    this.status={connected:false,reconnecting:false,scenes:[],inputs:[],recording:false,streaming:false,error:''};
  }
  async connect(url,password) {
    const u=new URL(url);
    if(u.protocol!=='ws:' || !['127.0.0.1','localhost','[::1]'].includes(u.hostname))
      throw Error('Connect to OBS on this PC using ws://127.0.0.1:4455.');
    await this.disconnect();
    this.credentials={url,password};this.wanted=true;
    return this.open(this.generation);
  }
  async open(generation) {
    if (!this.wanted || generation!==this.generation) return;
    const client=this.factory();this.client=client;
    client.on('ConnectionClosed',()=>{
      if(generation!==this.generation || client!==this.client) return;
      this.status.connected=false;this.schedule(generation);
    });
    for(const [event,key,field] of [['CurrentProgramSceneChanged','scene','sceneName'],['RecordStateChanged','recording','outputActive'],['StreamStateChanged','streaming','outputActive']])
      client.on(event,e=>{if(client===this.client){this.status[key]=e[field];this.emit('status');}});
    let timeout;
    try {
      await Promise.race([client.connect(this.credentials.url,this.credentials.password,{rpcVersion:1}),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('OBS connection timed out.')),8000);timeout.unref?.();})]);
      if(generation!==this.generation || client!==this.client){await client.disconnect();return;}
      this.status.connected=true;await this.refresh();
      this.status.reconnecting=false;this.status.error='';this.attempt=0;
      clearTimeout(this.retry);this.retry=null;this.emit('status');return this.status;
    } catch(e) {
      if(generation!==this.generation || client!==this.client) return;
      this.status.connected=false;this.status.error=e.message;
      client.removeAllListeners();await client.disconnect().catch(()=>{});
      this.schedule(generation);throw e;
    } finally {clearTimeout(timeout);}
  }
  schedule(generation) {
    if(!this.wanted || generation!==this.generation || this.retry) return;
    this.status.reconnecting=true;
    const delay=Math.min(this.retryMax,this.retryBase*2**Math.min(this.attempt++,8));
    this.retry=setTimeout(()=>{this.retry=null;this.open(generation).catch(()=>{});},delay);
    this.retry.unref?.();this.emit('status');
  }
  async disconnect() {
    this.wanted=false;this.generation++;clearTimeout(this.retry);this.retry=null;
    this.credentials=null;
    const client=this.client;this.client=null;
    this.status.connected=false;this.status.reconnecting=false;
    if(client){client.removeAllListeners();await client.disconnect().catch(()=>{});}
    this.emit('status');
  }
  async refresh() {
    if(!this.status.connected || !this.client) throw Error('OBS is disconnected.');
    const client=this.client;
    const [sc,ins,rec,stream]=await Promise.all(['GetSceneList','GetInputList','GetRecordStatus','GetStreamStatus'].map(x=>client.call(x)));
    if(client!==this.client) return this.status;
    Object.assign(this.status,{scenes:sc.scenes.map(x=>x.sceneName),scene:sc.currentProgramSceneName,inputs:ins.inputs.map(x=>x.inputName),recording:rec.outputActive,streaming:stream.outputActive});
    this.emit('status');return this.status;
  }
  async call(type,data) {
    if(!this.status.connected) throw Error('OBS is disconnected. No command has been queued.');
    const allowed=['SetCurrentProgramScene','SetInputMute','SetSceneItemEnabled','SetInputVolume','StartRecord','StopRecord','TriggerMediaInputAction','CreateInput','GetInputSettings'];
    if(!allowed.includes(type)) throw Error('Unsupported OBS action.');
    return this.client.call(type,data);
  }
}
module.exports={Obs};
