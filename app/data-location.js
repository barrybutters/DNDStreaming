const fs=require('node:fs');const path=require('node:path');
async function configureData(app,dialog) {
 let dir=process.env.DIRECTOR_DATA_DIR;
 if(!dir && process.env.DIRECTOR_PORTABLE==='1'){
  const base=path.dirname(app.getPath('exe')),config=path.join(base,'portable-location.json');
  if(fs.existsSync(config)){
   const saved=JSON.parse(fs.readFileSync(config,'utf8'));
   if(typeof saved.directory!=='string')throw Error('Invalid portable data location.');
   dir=path.resolve(base,saved.directory);
  } else {
   const choice=await dialog.showMessageBox({type:'question',title:'Portable campaign storage',message:'Where should Dungeon Director save campaigns and backups?',detail:'Beside the app keeps your data with this portable folder. A custom folder stays at its selected location.',buttons:['Beside this app','Choose a folder','Cancel'],defaultId:0,cancelId:2});
   if(choice.response===2)throw Error('Portable setup cancelled.');
   let selected='Data';
   if(choice.response===1){const pick=await dialog.showOpenDialog({title:'Choose campaign data folder',properties:['openDirectory','createDirectory']});if(pick.canceled)throw Error('Portable setup cancelled.');selected=pick.filePaths[0];}
   dir=path.resolve(base,selected);fs.mkdirSync(dir,{recursive:true});
   fs.writeFileSync(config,JSON.stringify({directory:selected},null,2));
  }
 }
 if(dir){dir=path.resolve(dir);fs.mkdirSync(dir,{recursive:true});const probe=path.join(dir,'.director-write-check');fs.writeFileSync(probe,'');fs.unlinkSync(probe);app.setPath('userData',dir);app.setPath('sessionData',dir);}
}
module.exports={configureData};
