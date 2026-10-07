import * as THREE from './vendor/three/three.module.min.js';
import {CORES,REST_Y,CORE_Z,DOCK_Z,RADIUS} from './game.js';

export function textMesh(text,width=.15,height=.028,color='#dbf2ef') {
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=128;
  const ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.font='600 48px Segoe UI';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,384,64);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:texture,transparent:true,side:THREE.DoubleSide,depthWrite:false}));
}
export function createWorld(stage) {
  const metal=new THREE.MeshStandardMaterial({color:0x18363f,metalness:.7,roughness:.32});
  const dark=new THREE.MeshStandardMaterial({color:0x0b1c29,metalness:.55,roughness:.55});
  const bench=new THREE.Mesh(new THREE.BoxGeometry(.89,.032,.66),metal);bench.position.set(0,-.108,-.065);stage.add(bench);
  const base=new THREE.Mesh(new THREE.BoxGeometry(.82,.10,.57),dark);base.position.set(0,-.168,-.065);stage.add(base);
  for(const x of [-.43,.43]){
    const rail=new THREE.Mesh(new THREE.BoxGeometry(.005,.008,.62),new THREE.MeshBasicMaterial({color:0x428ea0}));rail.position.set(x,-.088,-.065);stage.add(rail);
  }
  for(let row=0;row<10;row++){
    const line=new THREE.Mesh(new THREE.BoxGeometry(.84,.0005,.001),new THREE.MeshBasicMaterial({color:0x244a54}));line.position.set(0,-.091,-.35+row*.064);stage.add(line);
  }
  const backdrop=new THREE.Mesh(new THREE.PlaneGeometry(5,3),new THREE.MeshBasicMaterial({color:0x091321}));backdrop.position.set(0,.6,-1.3);stage.add(backdrop);
  const starGeometry=new THREE.BufferGeometry(),stars=[];
  for(let i=0;i<220;i++) stars.push(Math.sin(i*127.1)*2.4,Math.cos(i*43.7)*1.5+.45,-1.25);
  starGeometry.setAttribute('position',new THREE.Float32BufferAttribute(stars,3));
  stage.add(new THREE.Points(starGeometry,new THREE.PointsMaterial({color:0x79b3c7,size:.004})));
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(5,5),new THREE.MeshStandardMaterial({color:0x0e2330,metalness:.4,roughness:.7}));floor.rotation.x=-Math.PI/2;floor.position.y=-.57;stage.add(floor);
  const docks=CORES.map(spec=>{
    const group=new THREE.Group();group.position.set(spec.x,-.083,DOCK_Z);stage.add(group);
    const pad=new THREE.Mesh(new THREE.CylinderGeometry(.078,.087,.016,32),dark);group.add(pad);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.068,.002,6,40),new THREE.MeshBasicMaterial({color:spec.color}));ring.rotation.x=-Math.PI/2;ring.position.y=.010;group.add(ring);
    const beam=new THREE.Mesh(new THREE.CylinderGeometry(.062,.062,.18,24,1,true),new THREE.MeshBasicMaterial({color:spec.color,transparent:true,opacity:.08,side:THREE.DoubleSide,depthWrite:false}));beam.position.y=.10;group.add(beam);
    const title=textMesh(spec.name.toUpperCase()+' DOCK',.15,.025);title.rotation.x=-Math.PI/2;title.position.set(0,.012,-.099);group.add(title);
    return {group,ring,beam};
  });
  const targets=CORES.map((spec,i)=>{
    const group=new THREE.Group();stage.add(group);
    const body=new THREE.Mesh(i===0?new THREE.IcosahedronGeometry(RADIUS,2):i===1?new THREE.DodecahedronGeometry(RADIUS,0):new THREE.BoxGeometry(.075,.075,.075),
      new THREE.MeshStandardMaterial({color:spec.color,metalness:i===2?.8:.35,roughness:i===0?.16:.4,emissive:spec.color,emissiveIntensity:.12}));group.add(body);
    for(const angle of [0,Math.PI/2]) {
      const ring=new THREE.Mesh(new THREE.TorusGeometry(.048,.0018,6,36),new THREE.MeshBasicMaterial({color:spec.color}));ring.rotation.x=angle;group.add(ring);
    }
    const cradle=new THREE.Mesh(new THREE.CylinderGeometry(.062,.069,.012,24),dark);cradle.position.set(spec.x,-.085,CORE_Z);stage.add(cradle);
    const title=textMesh(spec.name+' / '+spec.mass+' kg',.16,.03);title.rotation.x=-Math.PI/2;title.position.set(spec.x,-.089,.188);stage.add(title);
    const box=new THREE.Box3();
    return {...spec,group,mesh:body,box};
  });
  const restart=new THREE.Group();restart.position.set(.37,.012,-.085);stage.add(restart);
  const button=new THREE.Mesh(new THREE.CylinderGeometry(.037,.04,.013,24),new THREE.MeshStandardMaterial({color:0x90dec6,emissive:0x90dec6,emissiveIntensity:.15}));restart.add(button);
  const caption=textMesh('NEW SHIFT',.11,.024);caption.rotation.x=-Math.PI/2;caption.position.set(0,.015,.06);restart.add(caption);
  const halo=new THREE.Mesh(new THREE.TorusGeometry(.044,.002,6,36),new THREE.MeshBasicMaterial({color:0xa5ffe3}));halo.rotation.x=-Math.PI/2;restart.add(halo);
  function update(game,time) {
    game.objects.forEach((object,i)=>{
      const target=targets[i];target.group.position.copy(object.position);target.group.quaternion.copy(object.quaternion);
      target.group.visible=object.state!=='delivered';
      target.box.setFromCenterAndSize(object.position,new THREE.Vector3(RADIUS*2,RADIUS*2,RADIUS*2));
      target.mesh.material.emissiveIntensity=object.state==='held'?.6:.12;
      docks[i].beam.material.opacity=object.state==='held'?.13+Math.sin(time*.004)*.035:object.state==='delivered'?.4:.035;
      docks[i].ring.rotation.z=time*.0002;
    });
  }
  return {targets,docks,restart,button,update};
}
