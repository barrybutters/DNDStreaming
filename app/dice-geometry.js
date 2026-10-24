/* Small original convex-polyhedron renderer; no network or WebGL dependency. */
(function(root){
 const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0), sub=(a,b)=>a.map((v,i)=>v-b[i]), cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]], unit=a=>{const n=Math.hypot(...a);return a.map(v=>v/(n||1))};
 function hull(vertices){
  const faces=[];
  for(let i=0;i<vertices.length;i++)for(let j=i+1;j<vertices.length;j++)for(let k=j+1;k<vertices.length;k++){
   let normal=unit(cross(sub(vertices[j],vertices[i]),sub(vertices[k],vertices[i])));
   if(Math.hypot(...normal)<.5)continue;
   let plane=dot(normal,vertices[i]);const distances=vertices.map(v=>dot(normal,v)-plane);
   if(distances.some(x=>x>1e-6)&&distances.some(x=>x< -1e-6))continue;
   if(plane<0){normal=normal.map(v=>-v);plane=-plane;}
   if(faces.some(f=>dot(f.normal,normal)>.99999))continue;
   const ids=vertices.map((v,index)=>Math.abs(dot(normal,v)-plane)<1e-5?index:-1).filter(x=>x>=0);
   const center=ids.reduce((a,id)=>a.map((x,n)=>x+vertices[id][n]/ids.length),[0,0,0]);
   const u=unit(sub(vertices[ids[0]],center)),v=cross(normal,u);
   ids.sort((a,b)=>Math.atan2(dot(sub(vertices[a],center),v),dot(sub(vertices[a],center),u))-Math.atan2(dot(sub(vertices[b],center),v),dot(sub(vertices[b],center),u)));
   faces.push({ids,normal,center});
  }
  return {vertices,faces};
 }
 const cache={};
 function mesh(sides){
  if(cache[sides])return cache[sides];
  const p=(1+Math.sqrt(5))/2;let vertices=[];
  if(sides===4)vertices=[[1,1,1],[1,-1,-1],[-1,1,-1],[-1,-1,1]];
  else if(sides===6){for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])vertices.push([x,y,z]);}
  else if(sides===8)vertices=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  else if(sides===12){for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])vertices.push([x,y,z]);for(const a of [-1,1])for(const b of [-1,1])vertices.push([0,a/p,b*p],[a/p,b*p,0],[b*p,0,a/p]);}
  else if(sides===10 || sides===100){
   // Dual of a pentagonal antiprism gives ten kite faces.
   const anti=[];for(let i=0;i<10;i++)anti.push([Math.cos(i*Math.PI/5),Math.sin(i*Math.PI/5),i%2?.52:-.52]);
   vertices=hull(anti).faces.map(f=>{const d=dot(f.normal,f.center);return f.normal.map(v=>v/d)});
  } else {for(const a of [-1,1])for(const b of [-1,1])vertices.push([0,a,b*p],[a,b*p,0],[b*p,0,a]);}
  const radius=Math.max(...vertices.map(v=>Math.hypot(...v)));
  return cache[sides]=hull(vertices.map(v=>v.map(x=>x/radius)));
 }
 function rotate(v,q){const t=cross(q.slice(0,3),v).map(x=>2*x);return v.map((x,i)=>x+q[3]*t[i]+cross(q.slice(0,3),t)[i]);}
 function orientation(normal){if(normal[2]<-.999999)return [1,0,0,0];const axis=cross(normal,[0,0,1]);return unit([...axis,1+normal[2]]);}
 function euler(x,y,z){const a=[Math.sin(x/2),0,0,Math.cos(x/2)],b=[0,Math.sin(y/2),0,Math.cos(y/2)],c=[0,0,Math.sin(z/2),Math.cos(z/2)];return multiply(multiply(a,b),c);}
 function multiply(a,b){const c=cross(a,b);return [a[3]*b[0]+b[3]*a[0]+c[0],a[3]*b[1]+b[3]*a[1]+c[1],a[3]*b[2]+b[3]*a[2]+c[2],a[3]*b[3]-dot(a.slice(0,3),b.slice(0,3))];}
 function mix(a,b,t){if(dot(a,b)<0)b=b.map(v=>-v);return unit(a.map((v,i)=>v*(1-t)+b[i]*t));}
 const api={mesh,rotate,orientation,euler,mix,dot,multiply};root.DirectorGeometry=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
