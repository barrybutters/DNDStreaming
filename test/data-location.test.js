const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {configureData}=require('../app/data-location');
test('portable location persists relative data folders and uses them after relocation',async t=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'portable-'));const next=base+'-moved';
 const oldPortable=process.env.DIRECTOR_PORTABLE,oldDir=process.env.DIRECTOR_DATA_DIR;
 process.env.DIRECTOR_PORTABLE='1';delete process.env.DIRECTOR_DATA_DIR;
 t.after(()=>{if(oldPortable===undefined)delete process.env.DIRECTOR_PORTABLE;else process.env.DIRECTOR_PORTABLE=oldPortable;if(oldDir===undefined)delete process.env.DIRECTOR_DATA_DIR;else process.env.DIRECTOR_DATA_DIR=oldDir;fs.rmSync(base,{recursive:true,force:true});fs.rmSync(next,{recursive:true,force:true});});
 let folder=base;const paths={};const app={getPath:()=>path.join(folder,'Dungeon Director.exe'),setPath:(key,value)=>paths[key]=value};
 await configureData(app,{showMessageBox:async()=>({response:0})});assert.equal(paths.userData,path.join(base,'Data'));
 assert.equal(JSON.parse(fs.readFileSync(path.join(base,'portable-location.json'))).directory,'Data');
 fs.renameSync(base,next);folder=next;
 await configureData(app,{showMessageBox:async()=>{throw Error('Choice must be remembered')}});
 assert.equal(paths.userData,path.join(next,'Data'));assert.equal(paths.sessionData,paths.userData);
});
