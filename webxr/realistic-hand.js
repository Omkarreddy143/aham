import * as THREE from './vendor/three/three.module.min.js';
import {GLTFLoader} from './vendor/three/addons/loaders/GLTFLoader.js';
import {CHAINS,JOINTS} from './logic.js';

export const SKIN_TONES={warm:0xb97952,light:0xe2b394,deep:0x704631};
const unitY=new THREE.Vector3(0,1,0),direction=new THREE.Vector3(),aPoint=new THREE.Vector3(),bPoint=new THREE.Vector3();
const palmZ=new THREE.Vector3(),palmX=new THREE.Vector3(),palmY=new THREE.Vector3(),basis=new THREE.Matrix4();
const previewRotations=Object.fromEntries(['left','right'].map(side=>[side,
  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),side==='right'?Math.PI/2:-Math.PI/2)
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2))]));
const bendRotation=new THREE.Quaternion(),xAxis=new THREE.Vector3(1,0,0);
const validPoint=p=>p&&[p.x,p.y,p.z].every(Number.isFinite);
const validRotation=q=>q&&[q.x,q.y,q.z,q.w].every(Number.isFinite)&&q.x*q.x+q.y*q.y+q.z*q.z+q.w*q.w>.5;

function skinTexture(){
  if(typeof document==='undefined')return null;
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
  const context=canvas.getContext('2d'),pixels=context.createImageData(128,128);
  let seed=91;
  for(let i=0;i<pixels.data.length;i+=4){seed=(seed*1664525+1013904223)>>>0;const value=175+(seed%52);pixels.data.set([value,value,value,255],i);}
  context.putImageData(pixels,0,0);
  const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(10,10);return texture;
}
const jointGeometry=new THREE.SphereGeometry(1,12,10),boneGeometry=new THREE.CylinderGeometry(1,1,1,10);

export class TrackedHand {
  constructor(scene,side,{buffer}={}){
    this.side=side;this.group=new THREE.Group();scene.add(this.group);this.group.visible=false;
    this.material=new THREE.MeshStandardMaterial({color:SKIN_TONES.warm,metalness:0,roughness:.63,transparent:true,opacity:1,bumpMap:skinTexture(),bumpScale:.00012});
    this.fallback=new THREE.Group();this.group.add(this.fallback);
    this.joints=new Map(JOINTS.map(name=>{const object=new THREE.Mesh(jointGeometry,this.material);this.fallback.add(object);return [name,object];}));
    this.segments=CHAINS.flatMap(chain=>chain.slice(1).map((name,i)=>{const mesh=new THREE.Mesh(boneGeometry,this.material);this.fallback.add(mesh);return {a:chain[i],b:name,mesh};}));
    this.palm=new THREE.Mesh(new THREE.SphereGeometry(1,20,14),this.material);this.fallback.add(this.palm);
    this.bind=new Map();this.bones=new Map();this.model=null;this.loaded=false;this.loadError=null;
    const loader=new GLTFLoader();
    this.ready=(buffer?loader.parseAsync(buffer,''):loader.loadAsync(new URL(`./assets/hands/${side}.glb`,import.meta.url).href)).then(gltf=>{
      this.model=gltf.scene;
      this.model.traverse(object=>{if(object.isSkinnedMesh){object.material=this.material;object.frustumCulled=false;this.mesh=object;}});
      for(const name of JOINTS){
        const bone=this.model.getObjectByName(name);
        if(!bone)throw new Error(`Hand model is missing ${name}`);
        this.bones.set(name,bone);this.bind.set(name,{position:bone.position.clone(),quaternion:bone.quaternion.clone()});
      }
      this.group.add(this.model);this.loaded=true;this.fallback.visible=false;return true;
    }).catch(error=>{this.loadError=error.message;this.model=null;return false;});
  }
  setAppearance({phase,form,skin=SKIN_TONES.warm,burst=0}){
    const changed=phase===2&&form!==0;
    this.material.color.setHex(changed?(form===1?0xe2cfb4:0xc3d9d4):skin);
    this.material.opacity=phase===3?.28:changed&&form===2?.4:1;
    this.material.wireframe=changed&&form===2;
    this.material.depthWrite=this.material.opacity>.9;
    this.material.metalness=changed&&form===1?.12:0;
    this.material.roughness=changed&&form===1?.35:.63;
    this.material.emissive.setHex(0xd9a96a);this.material.emissiveIntensity=burst*.12;
  }
  update(poses){
    const complete=JOINTS.every(name=>{const p=poses.get(name);return validPoint(p)&&validRotation(p.orientation);});
    this.group.visible=poses.size>0;
    if(this.model){
      // The generic-hand asset has all joint bones under one identity armature,
      // matching Three.js XRHandMeshModel's absolute joint pose convention.
      this.model.visible=complete;this.fallback.visible=!complete;
      if(complete){
        for(const [name,bone] of this.bones){const p=poses.get(name),q=p.orientation;bone.position.set(p.x,p.y,p.z);bone.quaternion.set(q.x,q.y,q.z,q.w).normalize();}
        this.model.updateMatrixWorld(true);return;
      }
    }
    for(const [name,object] of this.joints){const p=poses.get(name);object.visible=validPoint(p);if(object.visible){object.position.set(p.x,p.y,p.z);object.scale.setScalar(Math.min(.019,Math.max(.004,p.radius||.008)));}}
    for(const segment of this.segments){
      const a=poses.get(segment.a),b=poses.get(segment.b);segment.mesh.visible=validPoint(a)&&validPoint(b);if(!segment.mesh.visible)continue;
      aPoint.set(a.x,a.y,a.z);bPoint.set(b.x,b.y,b.z);direction.subVectors(bPoint,aPoint);const length=direction.length();
      if(length<.0001){segment.mesh.visible=false;continue;}
      segment.mesh.position.copy(aPoint).add(bPoint).multiplyScalar(.5);segment.mesh.quaternion.setFromUnitVectors(unitY,direction.normalize());
      const radius=Math.min(a.radius||.007,b.radius||.007)*.95;segment.mesh.scale.set(radius,length,radius);
    }
    const w=poses.get('wrist'),i=poses.get('index-finger-phalanx-proximal'),p=poses.get('pinky-finger-phalanx-proximal');
    this.palm.visible=[w,i,p].every(validPoint);
    if(this.palm.visible){
      aPoint.set(i.x,i.y,i.z);bPoint.set(p.x,p.y,p.z);direction.copy(aPoint).add(bPoint).multiplyScalar(.5);palmZ.set(w.x,w.y,w.z).sub(direction);palmX.copy(aPoint).sub(bPoint);
      const length=palmZ.length(),width=palmX.length();if(length<.001||width<.001){this.palm.visible=false;return;}
      palmZ.normalize();palmX.addScaledVector(palmZ,-palmX.dot(palmZ)).normalize();palmY.crossVectors(palmZ,palmX).normalize();
      this.palm.position.set(w.x,w.y,w.z).add(direction).multiplyScalar(.5);this.palm.quaternion.setFromRotationMatrix(basis.makeBasis(palmX,palmY,palmZ));this.palm.scale.set((width+.014)*.62,.012,length*.64);
    }
  }
  preview(time,{curl}={}){
    if(!this.loaded)return new Map();
    const previewRotation=previewRotations[this.side];
    const amount=curl??(Math.sin(time*.55)+1)*.32;
    const origin=new THREE.Vector3(this.side==='right'?.15:-.15,-.04,.19),poses=new Map();
    const add=(name,point,q)=>poses.set(name,{x:point.x,y:point.y,z:point.z,radius:.008,orientation:{x:q.x,y:q.y,z:q.z,w:q.w}});
    add('wrist',origin,previewRotation.clone().multiply(this.bind.get('wrist').quaternion));
    for(const chain of CHAINS){
      let point=origin.clone();
      for(let j=1;j<chain.length;j++){
        const bind=this.bind.get(chain[j]),previous=this.bind.get(chain[j-1]);
        const vector=bind.position.clone().sub(previous.position).applyQuaternion(previewRotation);
        const bend=j>2?-amount*(j-2)*.7:0;bendRotation.setFromAxisAngle(xAxis,bend);vector.applyQuaternion(bendRotation);point=point.clone().add(vector);
        const q=bendRotation.clone().multiply(previewRotation).multiply(bind.quaternion);add(chain[j],point,q);
      }
    }
    return poses;
  }
}
