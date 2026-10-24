const {test}=require('node:test');const assert=require('node:assert/strict');const g=require('../app/dice-geometry');
test('every standard die has the correct number of convex faces and can expose each result face',()=>{
 for(const sides of [4,6,8,10,12,20,100]){
  const mesh=g.mesh(sides);assert.equal(mesh.faces.length,sides===100?10:sides,`d${sides}`);
  for(const face of mesh.faces){const result=g.rotate(face.normal,g.orientation(face.normal));assert.ok(result[2]>.999,JSON.stringify({sides,result}));assert.ok(result.every(Number.isFinite));}
 }
});
