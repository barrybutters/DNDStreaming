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
test('starter maps publish with fog-protected image tokens and export independently',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'stock-map-'));const svc=new Service(dir);
 t.after(async()=>{await svc.close();fs.rmSync(dir,{recursive:true,force:true});});
 await svc.command('createCampaign',{name:'Map'});
 const mapAsset=svc.snapshot().catalog.find(x=>x.kind==='map');assert.ok(mapAsset);
 const map=await svc.command('stockAdd',{id:mapAsset.id});assert.equal(map.published,false);
 const token=await svc.command('stockAdd',{id:'token-elf',mapId:map.id});assert.equal(token.visible,false);
 await assert.rejects(svc.command('mapPublish',{id:map.id,published:true}),/held/);
 await svc.command('mode',{rehearsal:false});
 const c=active(svc.store.state);const m=c.maps.find(x=>x.id===map.id);m.tokens[0].visible=true;
 await svc.command('mapPublish',{id:map.id,published:true});assert.equal(svc.audience.map.tokens.length,1);
 const image=svc.audience.map.tokens[0].image;assert.ok(svc.asset(image));
 await svc.command('mapFog',{id:map.id,reveal:false});assert.equal(svc.audience.map.tokens.length,0);
 svc.importCampaign(svc.exportCampaign());const imported=active(svc.store.state);
 assert.notEqual(imported.maps[0].tokens[0].image,image);assert.ok(svc.asset(imported.maps[0].tokens[0].image));
});
