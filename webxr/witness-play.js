import * as THREE from './vendor/three/three.module.min.js';
import {BOWL} from './witness-interactions.js';

// Fixed-size pools keep drawing and growing effects bounded on the headset.
export class GardenPlay {
  constructor(root){
    this.root=root;this.clock=0;this.trailIndex=0;this.flowerIndex=0;
    const basic=(color,opacity=1)=>new THREE.MeshBasicMaterial({color,transparent:opacity<1,opacity,side:THREE.DoubleSide,depthWrite:false});
    const add=(geometry,material,parent=root)=>{const m=new THREE.Mesh(geometry,material);parent.add(m);return m;};
    this.bowl=new THREE.Group();root.add(this.bowl);this.bowl.position.set(BOWL.x,BOWL.y,BOWL.z);
    const dish=add(new THREE.SphereGeometry(.205,32,16,0,Math.PI*2,Math.PI/2,Math.PI/2),new THREE.MeshStandardMaterial({color:0x8eaa94,metalness:.3,roughness:.38,side:THREE.DoubleSide}),this.bowl);
    dish.scale.y=.22;
    this.pool=add(new THREE.CircleGeometry(.188,40),basic(0x9fddcc,.45),this.bowl);this.pool.rotation.x=-Math.PI/2;this.pool.position.y=.005;
    this.rim=add(new THREE.TorusGeometry(.20,.006,6,64),basic(0xccebdd),this.bowl);this.rim.rotation.x=-Math.PI/2;
    this.flowers=Array.from({length:7},(_,index)=>{
      const group=new THREE.Group();root.add(group);group.visible=false;
      const stem=add(new THREE.CylinderGeometry(.002,.003,.18,6),new THREE.MeshStandardMaterial({color:0x648569}),group);stem.position.y=.09;
      for(let j=0;j<2;j++){const leaf=add(new THREE.SphereGeometry(1,10,6),new THREE.MeshStandardMaterial({color:0x87a075}),group);leaf.scale.set(.018,.004,.045);leaf.position.set((j?1:-1)*.018,.07+j*.03,0);leaf.rotation.z=(j?-1:1)*.5;}
      const blossom=new THREE.Group();group.add(blossom);blossom.position.y=.18;
      const color=[0xf0c8a1,0xeac0cd,0xb8cfe0,0xf2ddb4][index%4];
      for(let j=0;j<7;j++){const petal=add(new THREE.SphereGeometry(1,12,8),new THREE.MeshStandardMaterial({color,roughness:.55,emissive:color,emissiveIntensity:.12}),blossom);const angle=j*Math.PI*2/7;petal.scale.set(.013,.007,.027);petal.position.set(Math.sin(angle)*.022,0,Math.cos(angle)*.022);petal.rotation.y=angle;}
      add(new THREE.SphereGeometry(.009,12,8),basic(0xf3d893),blossom);
      return {group,blossom,age:0,active:false};
    });
    this.trails=Array.from({length:180},()=>({age:10,position:new THREE.Vector3(),length:0,q:new THREE.Quaternion()}));
    this.trailMesh=new THREE.InstancedMesh(new THREE.CylinderGeometry(.003,.003,1,5),basic(0xecd4a4),this.trails.length);
    this.trailMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.trailMesh.frustumCulled=false;root.add(this.trailMesh);
    this.dummy=new THREE.Object3D();this.direction=new THREE.Vector3();this.up=new THREE.Vector3(0,1,0);
    this.mandala=new THREE.Group();root.add(this.mandala);this.mandala.visible=false;this.mandalaLife=0;this.previewCharge=0;
    for(let i=0;i<3;i++){const ring=add(new THREE.TorusGeometry(.07+i*.025,.002,5,56),basic([0xe5ca91,0xb7ddd3,0xccbce7][i]),this.mandala);ring.rotation.z=i*.3;}
    for(let i=0;i<12;i++){const petal=add(new THREE.TorusGeometry(.036,.0016,4,24),basic(0xe8d7ab),this.mandala);const a=i*Math.PI/6;petal.scale.set(.55,1,1);petal.position.set(Math.sin(a)*.052,Math.cos(a)*.052,0);petal.rotation.z=-a;}
    this.petals=new THREE.InstancedMesh(new THREE.SphereGeometry(1,6,4),basic(0xe6cab0,.75),48);this.petals.frustumCulled=false;root.add(this.petals);this.petalOrigin=new THREE.Vector3(0,0,-.18);this.petalLife=0;
    this.reset();
  }
  reset(){for(const flower of this.flowers){flower.active=false;flower.group.visible=false;}for(const t of this.trails)t.age=10;this.mandalaLife=0;this.petalLife=0;this.previewCharge=0;}
  plant(point){
    const flower=this.flowers[this.flowerIndex++%this.flowers.length];flower.active=true;flower.age=0;flower.group.visible=true;
    const angle=this.flowerIndex*2.399;flower.group.position.set(BOWL.x+Math.cos(angle)*.10,BOWL.y+.008,BOWL.z+Math.sin(angle)*.10);flower.group.scale.setScalar(.001);
    this.petalOrigin.set(point.x,point.y,point.z);this.petalLife=1;
  }
  paint(from,to){const t=this.trails[this.trailIndex++%this.trails.length];const a=new THREE.Vector3(from.x,from.y,from.z),b=new THREE.Vector3(to.x,to.y,to.z);t.position.copy(a).add(b).multiplyScalar(.5);t.length=a.distanceTo(b);t.q.setFromUnitVectors(this.up,this.direction.copy(b).sub(a).normalize());t.age=0;}
  join(point){this.mandala.position.set(point.x,point.y,point.z);this.mandalaLife=1;this.petalOrigin.copy(this.mandala.position);this.petalLife=1;}
  previewTrail(){for(let i=1;i<90;i++){const p=n=>({x:Math.cos(n*.065)*.20,y:.06+Math.sin(n*.065)*.10,z:-.02-n*.0015});this.paint(p(i-1),p(i));}}
  update(delta,time,interaction,phase){
    const dt=Math.min(.1,Math.max(0,delta));this.clock=time;
    this.bowl.visible=phase!==3||this.flowers.some(f=>f.active);
    const held=interaction.seeds.some(s=>s.owner);this.rim.material.color.setHex(held?0xf5d193:0xccebdd);this.pool.material.opacity=.35+Math.sin(time*1.7)*.06;
    for(const flower of this.flowers){if(!flower.active)continue;flower.age+=dt;const progress=Math.min(1,flower.age/2);flower.group.scale.setScalar(.001+progress*progress*(3-2*progress));flower.blossom.rotation.y=time*.08;flower.group.rotation.z=Math.sin(time*.8+flower.group.position.x)*.035;}
    this.trails.forEach((t,i)=>{t.age+=dt;this.dummy.position.copy(t.position);this.dummy.quaternion.copy(t.q);const fade=Math.max(0,1-t.age/7);this.dummy.scale.set(fade,t.length,fade);this.dummy.updateMatrix();this.trailMesh.setMatrixAt(i,this.dummy.matrix);});this.trailMesh.instanceMatrix.needsUpdate=true;
    this.mandalaLife=Math.max(0,this.mandalaLife-dt*.14);
    const charge=interaction.charge,center=interaction.mandalaCenter;
    if(center)this.mandala.position.set(center.x,center.y,center.z);
    const strength=Math.max(charge,this.mandalaLife);this.mandala.visible=strength>.01;this.mandala.scale.setScalar(.3+strength*.9);this.mandala.rotation.z=time*.15;
    this.petalLife=Math.max(0,this.petalLife-dt*.17);
    for(let i=0;i<48;i++){const a=i*2.399,age=1-this.petalLife;this.dummy.position.copy(this.petalOrigin).add(new THREE.Vector3(Math.cos(a)*age*.42,Math.sin(i*3.1)*.025+Math.sin(age*Math.PI)*.10-age*.12,Math.sin(a)*age*.42));this.dummy.rotation.set(time*.4+i,0,a);this.dummy.scale.set(.006*this.petalLife,.002*this.petalLife,.012*this.petalLife);this.dummy.updateMatrix();this.petals.setMatrixAt(i,this.dummy.matrix);}this.petals.instanceMatrix.needsUpdate=true;
  }
}
