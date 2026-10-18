(function(root){
 const defaults={map:{x:0,y:0,w:100,h:100},portrait:{x:25,y:8,w:50,h:65},title:{x:10,y:65,w:80,h:15},party:{x:2,y:85,w:96,h:13},initiative:{x:76,y:2,w:22,h:65},dice:{x:2,y:3,w:32,h:40}};
 function normalize(input={}){
  const result={};
  for(const [key,fallback] of Object.entries(defaults)){
   const box=input?.[key]||{};const number=(key,min,max)=>Number.isFinite(Number(box[key]))?Math.max(min,Math.min(max,Number(box[key]))):fallback[key];
   const x=number('x',0,95),y=number('y',0,95);
   result[key]={x,y,w:Math.min(100-x,number('w',5,100)),h:Math.min(100-y,number('h',5,100)),hidden:!!box.hidden};
  }
  return result;
 }
 root.DirectorLayout={defaults,normalize};if(typeof module!=='undefined')module.exports={defaults,normalize};
})(typeof window!=='undefined'?window:globalThis);
