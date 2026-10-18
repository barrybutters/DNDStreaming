const fs = require('node:fs');
const path = require('node:path');
const scenes = require('./assets/map-scenes.json');
function catalog() {
  const maps = scenes.filter(([id])=>fs.existsSync(path.join(__dirname,'assets/maps',id+'.webp'))).map(([id,name])=>({id,name,kind:'map',file:`maps/${id}.webp`}));
  const tokens = require('./assets/tokens/catalog.json');
  return [...maps,...tokens];
}
function asset(id) {
  const item=catalog().find(x=>x.id===id);
  if(!item) throw Error('Starter asset not found.');
  return {...item,path:path.join(__dirname,'assets',item.file)};
}
module.exports={catalog,asset};
