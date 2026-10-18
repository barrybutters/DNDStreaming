const {test}=require('node:test');const assert=require('node:assert/strict');const {normalize}=require('../app/layout');
test('overlay layout bounds every layer to canvas even with malformed and partial values',()=>{
 for(const input of [{dice:{x:95,y:95,w:200,h:200}},{title:{x:'invalid',h:-2}},{map:{x:97,y:99,w:NaN,h:Infinity}},null]){
  for(const box of Object.values(normalize(input))){assert.ok(box.x>=0 && box.y>=0);assert.ok(box.w>=5 && box.h>=5);assert.ok(box.x+box.w<=100 && box.y+box.h<=100);}
 }
});
