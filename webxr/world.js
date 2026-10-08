import * as THREE from './vendor/three/three.module.min.js';
import {CORES,REST_Y,CORE_Z,DOCK_Z,RADIUS} from './game.js';

// Bake text once; guidance reuses meshes rather than uploading textures per frame.
export function textMesh(text,width=.15,height=.028,color='#e9f6f3') {
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=144;
  const ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';
  let size=58;ctx.font='600 '+size+'px Segoe UI, sans-serif';
  while(ctx.measureText(text).width>720 && size>26){size-=2;ctx.font='600 '+size+'px Segoe UI, sans-serif';}
  ctx.fillText(text,384,72);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:texture,transparent:true,side:THREE.DoubleSide,depthWrite:false}));
}

export function createWorld(stage) {
  const metal=new THREE.MeshStandardMaterial({color:0x29404b,metalness:.68,roughness:.4});
  const dark=new THREE.MeshStandardMaterial({color:0x11202a,metalness:.48,roughness:.6});
  const surface=new THREE.MeshStandardMaterial({color:0x172b36,metalness:.38,roughness:.66});
  const trim=new THREE.MeshBasicMaterial({color:0x4fa998});
  const dimLine=new THREE.MeshBasicMaterial({color:0x244451});
  const white=new THREE.MeshBasicMaterial({color:0xd6f3eb});
  const topY=-.091;
  const bench=new THREE.Mesh(new THREE.BoxGeometry(.92,.034,.69),metal);bench.position.set(0,-.109,-.065);stage.add(bench);
  const worktop=new THREE.Mesh(new THREE.BoxGeometry(.873,.004,.645),surface);worktop.position.set(0,-.09,-.065);stage.add(worktop);
  const base=new THREE.Mesh(new THREE.BoxGeometry(.845,.10,.59),dark);base.position.set(0,-.168,-.065);stage.add(base);
  const edgeGeometry=new THREE.BoxGeometry(.004,.006,.645);
  for(const x of [-.441,.441]){
    const rail=new THREE.Mesh(edgeGeometry,trim);rail.position.set(x,-.085,-.065);stage.add(rail);
  }
  const frontLight=new THREE.Mesh(new THREE.BoxGeometry(.68,.004,.004),trim);frontLight.position.set(0,-.128,.282);stage.add(frontLight);
  const footGeometry=new THREE.BoxGeometry(.037,.28,.037);
  for(const x of [-.365,.365])for(const z of [-.28,.16]){
    const foot=new THREE.Mesh(footGeometry,dark);foot.position.set(x,-.36,z);stage.add(foot);
  }
  const lineGeometry=new THREE.BoxGeometry(.835,.0005,.001);
  for(let row=0;row<9;row++){
    const line=new THREE.Mesh(lineGeometry,dimLine);line.position.set(0,topY+.004,-.32+row*.067);stage.add(line);
  }
  const badge=textMesh('ORBIT FOUNDRY  /  RIGHT HAND',.30,.027,'#8fcfc1');badge.position.set(0,-.148,.285);stage.add(badge);
  const backdrop=new THREE.Mesh(new THREE.PlaneGeometry(5,3),new THREE.MeshBasicMaterial({color:0x0b1826}));backdrop.position.set(0,.6,-1.3);stage.add(backdrop);
  const starGeometry=new THREE.BufferGeometry(),stars=[];
  for(let i=0;i<100;i++)stars.push(Math.sin(i*127.1)*2.4,Math.cos(i*43.7)*1.5+.45,-1.25);
  starGeometry.setAttribute('position',new THREE.Float32BufferAttribute(stars,3));
  stage.add(new THREE.Points(starGeometry,new THREE.PointsMaterial({color:0x6190a3,size:.003})));
  const horizon=new THREE.Mesh(new THREE.PlaneGeometry(4,.0025),new THREE.MeshBasicMaterial({color:0x1d455c}));horizon.position.set(0,-.15,-1.245);stage.add(horizon);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(5,5),new THREE.MeshStandardMaterial({color:0x101f2a,metalness:.25,roughness:.8}));floor.rotation.x=-Math.PI/2;floor.position.y=-.57;stage.add(floor);

  const padGeometry=new THREE.CylinderGeometry(.080,.088,.017,32);
  const ringGeometry=new THREE.TorusGeometry(.073,.0022,6,40);
  const symbolGeometries=[new THREE.CircleGeometry(.023,32),new THREE.CircleGeometry(.026,6),new THREE.PlaneGeometry(.038,.038)];
  const docks=CORES.map((spec,i)=>{
    const group=new THREE.Group();group.position.set(spec.x,-.081,DOCK_Z);stage.add(group);
    const pad=new THREE.Mesh(padGeometry,dark);group.add(pad);
    const face=new THREE.Mesh(new THREE.CylinderGeometry(.068,.068,.002,32),surface);face.position.y=.010;group.add(face);
    const ring=new THREE.Mesh(ringGeometry,new THREE.MeshBasicMaterial({color:spec.color,transparent:true,opacity:.6}));ring.rotation.x=-Math.PI/2;ring.position.y=.012;group.add(ring);
    const symbol=new THREE.Mesh(symbolGeometries[i],new THREE.MeshBasicMaterial({color:spec.color,transparent:true,opacity:.24,side:THREE.DoubleSide}));symbol.rotation.x=-Math.PI/2;symbol.position.y=.012;group.add(symbol);
    const beam=new THREE.Mesh(new THREE.CylinderGeometry(.070,.070,.075,24,1,true),new THREE.MeshBasicMaterial({color:spec.color,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}));beam.position.y=.052;group.add(beam);
    const title=textMesh(spec.name.toUpperCase()+' DOCK',.16,.031);title.rotation.x=-1.04;title.position.set(0,.029,-.092);group.add(title);
    const releaseLabel=textMesh('OPEN HERE',.135,.029,'#eaffdf');releaseLabel.rotation.x=-.85;releaseLabel.position.set(0,.095,0);releaseLabel.visible=false;group.add(releaseLabel);
    const deliveredLabel=textMesh('DELIVERED',.15,.032,'#eaffdf');deliveredLabel.rotation.x=-.70;deliveredLabel.visible=false;group.add(deliveredLabel);
    return {group,ring,beam,symbol,releaseLabel,deliveredLabel};
  });

  const objectGeometries=[new THREE.IcosahedronGeometry(RADIUS,2),new THREE.DodecahedronGeometry(RADIUS,0),new THREE.BoxGeometry(.075,.075,.075)];
  const hoverGeometry=new THREE.TorusGeometry(.054,.0024,6,36);
  const cradleGeometry=new THREE.CylinderGeometry(.061,.068,.013,24);
  const size=new THREE.Vector3(RADIUS*2,RADIUS*2,RADIUS*2);
  const targets=CORES.map((spec,i)=>{
    const group=new THREE.Group();stage.add(group);
    const body=new THREE.Mesh(objectGeometries[i],new THREE.MeshStandardMaterial({color:spec.color,metalness:i===2?.7:.42,roughness:i===0?.27:.43,emissive:spec.color,emissiveIntensity:.1}));group.add(body);
    const rim=new THREE.LineSegments(new THREE.EdgesGeometry(objectGeometries[i],i===0?28:18),new THREE.LineBasicMaterial({color:0x0b2430,transparent:true,opacity:.45}));group.add(rim);
    const hover=new THREE.Mesh(hoverGeometry,new THREE.MeshBasicMaterial({color:spec.color,transparent:true,opacity:.9,depthWrite:false}));hover.rotation.x=-Math.PI/2;hover.visible=false;stage.add(hover);
    const cradle=new THREE.Mesh(cradleGeometry,dark);cradle.position.set(spec.x,-.083,CORE_Z);stage.add(cradle);
    const cradleRim=new THREE.Mesh(new THREE.TorusGeometry(.058,.0012,5,32),new THREE.MeshBasicMaterial({color:spec.color,transparent:true,opacity:.4}));cradleRim.rotation.x=-Math.PI/2;cradleRim.position.set(spec.x,-.075,CORE_Z);stage.add(cradleRim);
    const title=textMesh(spec.name.toUpperCase()+'  ·  '+spec.mass+' kg',.19,.035);title.rotation.x=-1.06;title.position.set(spec.x,-.074,.195);stage.add(title);
    const box=new THREE.Box3();
    const sphere={center:new THREE.Vector3(),radius:RADIUS};
    const orientedBox=i===2?{center:new THREE.Vector3(),quaternion:new THREE.Quaternion(),halfSize:new THREE.Vector3(.0375,.0375,.0375)}:null;
    return {...spec,group,mesh:body,box,sphere,orientedBox,hover};
  });

  // A landing projection guides placement without clamping tracked hand poses.
  const landing=new THREE.Mesh(new THREE.RingGeometry(.037,.040,32),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false}));landing.rotation.x=-Math.PI/2;landing.visible=false;stage.add(landing);
  const routeGeometry=new THREE.BufferGeometry();const routePoints=new Float32Array(6);routeGeometry.setAttribute('position',new THREE.BufferAttribute(routePoints,3));
  const route=new THREE.Line(routeGeometry,new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:.28,depthWrite:false}));route.frustumCulled=false;route.visible=false;stage.add(route);
  const liftGuide=new THREE.Group();stage.add(liftGuide);liftGuide.visible=false;
  const liftMaterial=new THREE.MeshBasicMaterial({color:0xffd78c});
  const stem=new THREE.Mesh(new THREE.CylinderGeometry(.0015,.0015,.058,8),liftMaterial);stem.position.y=.027;liftGuide.add(stem);
  const arrow=new THREE.Mesh(new THREE.ConeGeometry(.007,.013,10),liftMaterial);arrow.position.y=.061;liftGuide.add(arrow);
  const liftLabel=textMesh('LIFT',.064,.023,'#ffdda4');liftLabel.position.set(.033,.035,0);liftLabel.rotation.x=-.65;liftGuide.add(liftLabel);
  const liftTicks=Array.from({length:6},(_,i)=>{
    const tick=new THREE.Mesh(new THREE.BoxGeometry(.013,.0025,.0025),new THREE.MeshBasicMaterial({color:0x425668}));tick.position.set(-.013,.003+i*.010,0);liftGuide.add(tick);return tick;
  });
  const liftOffset=new THREE.Vector3(.074,-.02,0);

  const restart=new THREE.Group();restart.position.set(.37,.012,-.085);stage.add(restart);
  const button=new THREE.Mesh(new THREE.CylinderGeometry(.037,.040,.013,24),new THREE.MeshStandardMaterial({color:0x7fcdb7,emissive:0x7fcdb7,emissiveIntensity:.15,metalness:.3,roughness:.5}));restart.add(button);
  const caption=textMesh('NEW SHIFT',.116,.028);caption.rotation.x=-1.05;caption.position.set(0,.025,.066);restart.add(caption);
  const halo=new THREE.Mesh(new THREE.TorusGeometry(.044,.0015,6,36),new THREE.MeshBasicMaterial({color:0x4c8278}));halo.rotation.x=-Math.PI/2;halo.position.y=.009;restart.add(halo);
  const restartTicks=Array.from({length:12},(_,i)=>{
    const angle=i*Math.PI/6, tick=new THREE.Mesh(new THREE.BoxGeometry(.009,.002,.002),white);
    tick.position.set(Math.sin(angle)*.044,.010,Math.cos(angle)*.044);tick.rotation.y=angle;tick.visible=false;restart.add(tick);return tick;
  });
  function updateRestart(progress,touching=false) {
    const amount=Math.max(0,Math.min(1,progress||0));
    button.material.emissiveIntensity=.15+amount*.65;
    halo.material.color.setHex(touching?0xa5ffe3:0x4c8278);
    restartTicks.forEach((tick,i)=>{tick.visible=touching && amount>i/12;});
  }

  function update(game,time) {
    const held=game.held;
    const hoverId=typeof game.hovered==='string'?game.hovered:game.hovered?.id || game.grabCandidate;
    const lifted=held && (held.lifted || game.liftProgress>=1);
    const aligned=held && (game.dockAligned ?? (lifted && Math.hypot(held.position.x-held.x,held.position.z-DOCK_Z)<.078));
    game.objects.forEach((object,i)=>{
      const target=targets[i],dock=docks[i],isHeld=object===held,isHover=!held && hoverId===object.id;
      target.group.position.copy(object.position);target.group.quaternion.copy(object.quaternion);target.group.visible=object.state!=='delivered';
      target.box.setFromCenterAndSize(object.position,size);
      target.sphere.center.copy(object.position);
      if(target.orientedBox){target.orientedBox.center.copy(object.position);target.orientedBox.quaternion.copy(object.quaternion);}
      target.mesh.material.emissiveIntensity=isHeld?.30:isHover?.28:.10;
      target.hover.visible=isHover && object.state!=='delivered';
      if(isHover){
        target.hover.position.copy(object.position);target.hover.position.y-=RADIUS*.58;
        target.hover.scale.setScalar(1+.035*Math.sin(time*.007));
        target.hover.material.opacity=.65+Math.min(1,game.grabProgress || 0)*.3;
      }
      dock.ring.material.opacity=isHeld?1:object.state==='delivered'?1:.5;
      dock.ring.scale.setScalar(isHeld?1+.025*Math.sin(time*.006):1);
      dock.symbol.material.opacity=isHeld?.45:.20;
      dock.beam.material.opacity=isHeld?(aligned?.16:.065):object.state==='delivered'?.20:0;
      dock.releaseLabel.visible=isHeld && aligned;
      if(isHeld && aligned)dock.releaseLabel.scale.setScalar(1+.025*Math.sin(time*.006));
      dock.deliveredLabel.visible=object.state==='delivered';
      if(object.state==='delivered'){
        const progress=1-Math.max(0,Math.min(1,object.cooldown/.9));
        dock.deliveredLabel.position.set(0,.08+progress*.025,0);dock.deliveredLabel.material.opacity=Math.min(1,object.cooldown/.25);
      }
    });
    landing.visible=!!held && !!lifted;route.visible=!!held && !!lifted;liftGuide.visible=!!held && !lifted;
    if(held){
      landing.position.set(held.position.x,-.068,held.position.z);landing.material.color.setHex(held.color);
      landing.material.opacity=aligned?1:.6;route.material.color.setHex(held.color);
      routePoints.set([held.position.x,-.067,held.position.z,held.x,-.067,DOCK_Z]);routeGeometry.attributes.position.needsUpdate=true;
      liftGuide.position.copy(held.position).add(liftOffset);
      const progress=Math.max(0,Math.min(1,game.liftProgress ?? (held.position.y-REST_Y)/.075));
      liftTicks.forEach((tick,i)=>tick.material.color.setHex(progress>i/6?0xffd78c:0x425668));
    }
  }
  return {targets,docks,restart,button,update,updateRestart};
}
