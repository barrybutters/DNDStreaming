const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Service}=require('../app/service');const {active}=require('../app/core');
test('starter tokens are independent managed assets and retain images through export/import',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'stock-'));const svc=new Service(dir);
 t.after(async()=>{await svc.close();fs.rmSync(dir,{recursive:true,force:true});});
 await svc.command('createCampaign',{name:'Tokens'});
 const catalog=svc.snapshot().catalog;assert.equal(catalog.filter(x=>x.kind==='token').length,98);
 for(const item of catalog.filter(x=>x.kind==='token')){const svg=fs.readFileSync(require('../app/stock').asset(item.id).path,'utf8');assert.ok(svg.includes('<svg'));assert.ok(!/<script|onload=|javascript:/i.test(svg));}
 const media=await svc.command('stockAdd',{id:'token-dragonborn'});assert.equal(media.kind,'image');
 const imported=svc.importCampaign(svc.exportCampaign());const c=active(svc.store.state);
 assert.notEqual(c.media[0].id,media.id);assert.ok(fs.existsSync(svc.asset(c.media[0].id).file));
});
