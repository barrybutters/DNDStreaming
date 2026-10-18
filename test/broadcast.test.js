const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {Service} = require('../app/service');
const {active} = require('../app/core');
async function setup(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'broadcast-'));
  const svc=new Service(dir);
  t.after(async()=>{await svc.close();fs.rmSync(dir,{recursive:true,force:true})});
  await svc.command('createCampaign',{name:'Broadcast'});return svc;
}
test('public rolls fail clearly when held and reach actual SSE with unique IDs when enabled',async t=>{
  const svc=await setup(t);await svc.listen(true);
  await assert.rejects(svc.command('roll',{expression:'2d6+3',publish:true}),/output is held/);
  await svc.command('mode',{rehearsal:false});
  const controller=new AbortController();
  const response=await fetch(svc.url+'/events',{signal:controller.signal});
  const reader=response.body.getReader();await reader.read();
  const result=await svc.command('roll',{expression:'2d6+3',publish:true,label:'Goblin attack'});
  const message=new TextDecoder().decode((await reader.read()).value);
  assert.ok(message.includes(result.rollId));assert.equal(svc.audience.dice.total,result.total);
  assert.equal(result.label,'Goblin attack');assert.equal(result.total,result.values.reduce((a,b)=>a+b,0)+3);
  controller.abort();await reader.cancel().catch(()=>{});
  for (const url of ['/dice','/battlemap','/dice-view.js']) assert.equal((await fetch(svc.url+url)).status,200);
});
test('panic remains effective while rehearsal holds old audience output',async t=>{
  const svc=await setup(t);const c=active(svc.store.state);
  await svc.command('mode',{rehearsal:false});
  await svc.command('public',{title:'Old output',showParty:true});
  await svc.command('mode',{rehearsal:true});
  c.obs.safeScene='Privacy';c.obs.muteInputs=['Mic'];const calls=[];
  svc.obs.call=async(...args)=>calls.push(args);
  await svc.command('panic');
  assert.equal(svc.audience.paused,true);assert.equal(svc.audience.title,'We’ll be right back');
  assert.deepEqual(svc.audience.party,[]);assert.equal(calls.length,2);
});
test('clearing dice while held cannot publish private draft content',async t=>{
  const svc=await setup(t);await svc.command('mode',{rehearsal:false});
  await svc.command('roll',{expression:'1d20',publish:true});
  await svc.command('mode',{rehearsal:true});
  await svc.command('public',{title:'Secret draft'});
  await svc.command('public',{dice:null});
  assert.equal(svc.audience.dice,null);assert.equal(svc.audience.title,'');
});
test('visual dice settle on server values, ignore duplicate events, and expire',()=>{
  const {JSDOM}=require('jsdom');const {create}=require('../app/dice-view');
  const dom=new JSDOM('<div id="dice"></div>');const node=dom.window.document.querySelector('#dice');
  const jobs=[];let now=10000;const view=create(node,{now:()=>now,setTimeout:(fn,ms)=>{const job={fn,ms};jobs.push(job);return job},clearTimeout:job=>{if(job)job.cancel=true}});
  const roll={rollId:'a',at:now,values:[6,2],total:11,expression:'2d6+3',label:'<script>private</script>'};
  view.show(roll);assert.equal(node.querySelector('script'),null);
  jobs.find(x=>x.ms===1600).fn();
  assert.equal(node.querySelector('b').textContent,'11');
  assert.deepEqual([...node.querySelectorAll('.visual-die')].map(x=>x.textContent),['6','2']);
  const count=jobs.length;view.show(roll);assert.equal(jobs.length,count);
  now+=15000;view.show({...roll,rollId:'old'});assert.equal(node.hidden,true);
});
test('shortcut diagnostic suppresses normal actions while privacy pause remains active',async t=>{
 const svc=await setup(t);let calls=0;
 svc.command=async(type)=>{calls++;assert.equal(type,'panic')};
 svc.hotkeyTestUntil=Date.now()+60000;
 await svc.triggerHotkey({key:'Ctrl+F1',action:'nextTurn'});
 assert.equal(calls,0);assert.match(svc.lastHotkey,/nextTurn/);
 await svc.triggerHotkey({key:'Ctrl+F2',action:'panic'});assert.equal(calls,1);
});
