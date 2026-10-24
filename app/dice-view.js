/* Animation is presentation only: server values and totals remain authoritative. */
(function(root){
 function create(node,clock={}){
  const now=clock.now||Date.now,schedule=clock.setTimeout||setTimeout,cancel=clock.clearTimeout||clearTimeout;
  const win=node.ownerDocument.defaultView||root;
  const raf=clock.requestAnimationFrame||win.requestAnimationFrame?.bind(win),caf=clock.cancelAnimationFrame||win.cancelAnimationFrame?.bind(win);
  let key,settle,hide,frame,canvas,ctx,bodies=[],start;
  const geometry=root.DirectorGeometry||(typeof require!=='undefined'?require('./dice-geometry'):null);
  function clear(){cancel(settle);cancel(hide);if(frame)caf?.(frame);frame=null;node.replaceChildren();node.hidden=true;}
  function size(){const rect=node.getBoundingClientRect();return {w:rect.width||win.innerWidth||1920,h:rect.height||win.innerHeight||1080};}
  function draw(elapsed){
   if(!ctx)return;
   const {w,h}=size(),dpr=Math.min(win.devicePixelRatio||1,2);
   if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
   ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
   const t=Math.min(1,elapsed/3000),travel=1-Math.pow(1-t,3),blend=Math.max(0,(t-.65)/.35);
   const columns=Math.min(8,bodies.length),rows=Math.ceil(bodies.length/columns);
   const radius=Math.max(7,Math.min(57,w/20,h/11,w/(columns*3),h/(rows*5)));
   for(let i=0;i<bodies.length;i++){
    const b=bodies[i],x=(b.fromX+(b.x-b.fromX)*travel)*w,y=(b.fromY+(b.y-b.fromY)*travel)*h;
    const bounce=t<1?Math.abs(Math.sin(t*Math.PI*5+b.phase))*Math.pow(1-t,1.7)*h*.22:0;
    const spin=geometry.euler(b.spin[0]*(1-travel),b.spin[1]*(1-travel),b.spin[2]*(1-travel));
    const q=geometry.mix(spin,b.target,blend*blend*(3-2*blend));
    const shade=ctx.createRadialGradient(x,y+radius*.45,0,x,y+radius*.45,radius*(1.1+bounce/h));
    shade.addColorStop(0,'rgba(0,0,0,'+(.38*(1-bounce/h))+')');shade.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=shade;ctx.beginPath();ctx.ellipse(x,y+radius*.45,radius*1.4,radius*.55,0,0,Math.PI*2);ctx.fill();
    const rotated=b.mesh.vertices.map(v=>geometry.rotate(v,q));
    const faces=b.mesh.faces.map((f,index)=>({...f,index,normal:geometry.rotate(f.normal,q),center:geometry.rotate(f.center,q)})).filter(f=>f.normal[2]>.015).sort((a,b)=>a.center[2]-b.center[2]);
    const scale=radius*(1+bounce/h*.3);
    const project=v=>[x+v[0]*scale/(1-v[2]*.18),y-bounce+v[1]*scale/(1-v[2]*.18)];
    for(const f of faces){
     const pts=f.ids.map(id=>project(rotated[id]));ctx.beginPath();pts.forEach((p,j)=>j?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();
     const light=Math.max(0,Math.min(1,.45+f.normal[2]*.35-f.normal[0]*.2-f.normal[1]*.15));
     ctx.fillStyle=`hsl(${b.hue} 45% ${24+light*37}%)`;ctx.fill();ctx.lineWidth=1.4;ctx.strokeStyle='rgba(255,237,192,.75)';ctx.stroke();
     const center=project(f.center),number=f.index===b.face?b.value:f.index+1;
     ctx.save();ctx.clip();ctx.translate(...center);ctx.rotate((1-blend)*b.spin[2]*(1-travel));ctx.scale(1,Math.max(.22,f.normal[2]));
     ctx.fillStyle='#fff3d7';ctx.strokeStyle='rgba(0,0,0,.55)';ctx.lineWidth=3;
     ctx.font=`700 ${Math.round(radius*(b.sides===6?.61:.43))}px Segoe UI, sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.strokeText(String(number),0,0);ctx.fillText(String(number),0,0);ctx.restore();
    }
   }
  }
  function show(roll){
   if(!roll){key=null;clear();return;}
   const next=roll.rollId||JSON.stringify(roll);if(next===key)return;key=next;clear();
   const age=Math.max(0,now()-(roll.at||now()));if(age>=14000)return;
   node.hidden=false;start=now()-age;
   const doc=node.ownerDocument;canvas=doc.createElement('canvas');canvas.className='dice-table';canvas.setAttribute('aria-hidden','true');
   // jsdom/fake clocks use the accessible result without needing a canvas engine.
   ctx=clock.now?null:canvas.getContext('2d');
   const result=doc.createElement('div');result.className='dice-result';
   const label=doc.createElement('div');label.className='roll-label';label.textContent=roll.label||'NPC / monster roll';
   const total=doc.createElement('b');total.textContent='Rolling…';
   const detail=doc.createElement('small');detail.textContent=roll.expression;
   const accessible=doc.createElement('div');accessible.className='dice-accessible';
   const dice=(roll.values||[]).slice(0,100).map(value=>{const die=doc.createElement('span');die.className='visual-die rolling';die.textContent='?';accessible.append(die);return {die,value};});
   result.append(label,total,detail);node.append(canvas,result,accessible);
   const sides=Number(/d(\d+)/i.exec(roll.expression)?.[1]||20),mesh=geometry.mesh(sides);
   let seed=Array.from(String(next)).reduce((h,c)=>Math.imul(h^c.charCodeAt(0),16777619),2166136261)>>>0;
   const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
   bodies=dice.map(({value},i)=>{
    const face=(value-1)%mesh.faces.length,columns=Math.min(8,dice.length),rows=Math.ceil(dice.length/columns);
    return {value,sides,mesh,face,target:geometry.multiply(geometry.euler(.24,-.19,random()*Math.PI*2),geometry.orientation(mesh.faces[face].normal)),
     x:.18+((i%columns)+.5)*.64/columns+(random()-.5)*.035,y:.3+(Math.floor(i/columns)+.5)*.43/rows+(random()-.5)*Math.min(.24,.28/rows),
     fromX:random()>.5?1.12:-.12,fromY:.1+random()*.6,phase:random()*6,spin:[12+random()*10,9+random()*12,8+random()*8],hue:35+(i%3)*8};
   });
   function finish(){for(const {die,value} of dice){die.classList.remove('rolling');die.textContent=value;}total.textContent=String(roll.total);detail.textContent=`${roll.expression} · ${(roll.values||[]).join(', ')}`;result.classList.add('settled');draw(3000);}
   const reduced=win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
   if(age>=3000||reduced)finish();
   else {settle=schedule(finish,3000-age);const tick=()=>{const elapsed=now()-start;draw(elapsed);if(elapsed<3000)frame=raf?.(tick);};if(ctx)tick();}
   hide=schedule(clear,14000-age);
  }
  return {show,clear};
 }
 root.DirectorDice={create};if(typeof module!=='undefined')module.exports={create};
})(typeof window!=='undefined'?window:globalThis);
