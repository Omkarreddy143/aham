import * as THREE from './vendor/three/three.module.min.js';

function randomSequence(seed){return ()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}
export function shoreHeight(x,z){
  const boundary=Math.hypot(x/8,(z+9)/12)+Math.sin(x*.38+z*.26)*.055+Math.sin(z*.74-x*.43)*.024;
  const bank=Math.max(0,boundary-1);
  const rise=Math.min(4.6,bank*2.8);
  const irregular=(Math.sin(x*.65+z*.27)*.35+Math.sin(z*.43-x*.26)*.2)*Math.min(1,bank*3);
  return -.95+rise+irregular;
}
function canvasTexture(width,height,paint){
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;paint(canvas.getContext('2d'),width,height);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
export function createNaturalGarden(root){
  const random=randomSequence(74019),dummy=new THREE.Object3D(),color=new THREE.Color();
  const add=(geometry,material)=>{const mesh=new THREE.Mesh(geometry,material);root.add(mesh);return mesh;};
  const standard=(color,options={})=>new THREE.MeshStandardMaterial({color,roughness:.9,...options});
  const skyTexture=canvasTexture(32,512,(context,w,h)=>{
    const gradient=context.createLinearGradient(0,0,0,h);
    gradient.addColorStop(0,'#789aaa');gradient.addColorStop(.48,'#aac4c3');gradient.addColorStop(.70,'#d6d5bd');gradient.addColorStop(.84,'#efd2ad');gradient.addColorStop(1,'#819f99');
    context.fillStyle=gradient;context.fillRect(0,0,w,h);
  });
  add(new THREE.SphereGeometry(49,32,20),new THREE.MeshBasicMaterial({map:skyTexture,side:THREE.BackSide,depthWrite:false}));
  const glowTexture=canvasTexture(128,128,(context,w,h)=>{
    const gradient=context.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);
    gradient.addColorStop(0,'#ffffffd0');gradient.addColorStop(.18,'#ffffff80');gradient.addColorStop(.5,'#ffffff22');gradient.addColorStop(1,'#ffffff00');context.fillStyle=gradient;context.fillRect(0,0,w,h);
  });
  function glow(position,color,size){const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture,color,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));sprite.position.copy(position);sprite.scale.set(size,size,1);root.add(sprite);return sprite;}
  const sun=add(new THREE.SphereGeometry(.65,24,16),new THREE.MeshBasicMaterial({color:0xffe6b9}));sun.position.set(-9,3.5,-26);
  glow(sun.position,0xffdfae,5.2);
  const cloudTexture=canvasTexture(512,128,(context,w,h)=>{
    for(let i=0;i<18;i++){
      const x=35+i*25,y=68+Math.sin(i*1.2)*15,r=22+random()*23;
      const gradient=context.createRadialGradient(x,y,0,x,y,r);gradient.addColorStop(0,'#fff5e9ad');gradient.addColorStop(.5,'#fff5e968');gradient.addColorStop(1,'#fff5e900');context.fillStyle=gradient;context.fillRect(x-r,y-r,r*2,r*2);
    }
  });
  const clouds=[];
  for(let i=0;i<6;i++){
    const cloud=new THREE.Sprite(new THREE.SpriteMaterial({map:cloudTexture,color:0xffffff,transparent:true,opacity:.65,depthWrite:false}));
    cloud.position.set(-20+i*7,5.4+(i%3)*1.2,-27-(i%2)*5);cloud.scale.set(9,2.1,1);root.add(cloud);clouds.push({mesh:cloud,x:cloud.position.x});
  }

  // One continuous height field yields curved banks and gently rolling hills.
  const groundGeometry=new THREE.PlaneGeometry(70,70,100,100);groundGeometry.rotateX(-Math.PI/2);
  const groundPositions=groundGeometry.attributes.position,groundColors=new Float32Array(groundPositions.count*3);
  const grassColor=new THREE.Color(0x647a49),sandColor=new THREE.Color(0xb39d76),forestColor=new THREE.Color(0x496b46);
  for(let i=0;i<groundPositions.count;i++){
    const x=groundPositions.getX(i),z=groundPositions.getZ(i),height=shoreHeight(x,z);groundPositions.setY(i,height);
    const bank=Math.hypot(x/8,(z+9)/12)-1;
    color.copy(bank<.11?sandColor:grassColor).lerp(forestColor,Math.max(0,Math.min(.5,(height+.2)*.1)));
    color.multiplyScalar(.9+random()*.18);groundColors.set([color.r,color.g,color.b],i*3);
  }
  groundGeometry.setAttribute('color',new THREE.BufferAttribute(groundColors,3));groundGeometry.computeVertexNormals();
  add(groundGeometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));

  const waterMaterial=new THREE.ShaderMaterial({
    uniforms:{uTime:{value:0},uDeep:{value:new THREE.Color(0x315b56)},uSky:{value:new THREE.Color(0xb5cfcb)},uSun:{value:new THREE.Color(0xf2d8af)}},
    vertexShader:`varying vec3 vWorld; varying vec2 vSurface;
      void main(){vec4 world=modelMatrix*vec4(position,1.0);vWorld=world.xyz;vSurface=position.xz;gl_Position=projectionMatrix*viewMatrix*world;}`,
    fragmentShader:`uniform float uTime; uniform vec3 uDeep,uSky,uSun; varying vec3 vWorld; varying vec2 vSurface;
      void main(){
        vec2 p=vSurface;
        float waveX=sin(p.x*4.8+p.y*2.1+uTime*.55)*.027+sin(p.x*10.0-p.y*3.7-uTime*.8)*.008;
        float waveZ=cos(p.y*6.3+p.x*1.7-uTime*.48)*.022+sin(p.y*13.0+uTime*.7)*.006;
        vec3 normal=normalize(vec3(waveX,1.0,waveZ));vec3 view=normalize(cameraPosition-vWorld);
        float fresnel=pow(1.0-max(dot(normal,view),0.0),3.0);
        vec3 result=mix(uDeep,uSky,.2+fresnel*.65);
        vec3 halfway=normalize(view+normalize(vec3(-.28,.19,-1.0)));
        float specular=pow(max(dot(normal,halfway),0.0),180.0);
        result+=uSun*specular*.75;
        result+=vec3(.012)*sin(p.x*7.0+p.y*5.0+waveX*22.0+uTime*.4);
        float distanceFog=smoothstep(8.0,39.0,length(cameraPosition-vWorld));result=mix(result,uSky*.72,distanceFog*.65);
        gl_FragColor=vec4(result,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const water=add(new THREE.PlaneGeometry(69,69),waterMaterial);water.rotation.x=-Math.PI/2;water.position.y=-.85;
  // The vertex shader uses the original plane coordinates for wave motion.
  waterMaterial.vertexShader=waterMaterial.vertexShader.replace('vSurface=position.xz','vSurface=position.xy');

  const woodTexture=canvasTexture(256,512,(context,w,h)=>{
    context.fillStyle='#a38765';context.fillRect(0,0,w,h);
    for(let i=0;i<180;i++){
      const x=random()*w;context.strokeStyle=i%3?'#6b543024':'#ddc49a32';context.lineWidth=.4+random()*1.7;context.beginPath();
      for(let y=0;y<=h;y+=10){const px=x+Math.sin(y*.025+i)*2.5+Math.sin(y*.008+i*2)*3.5;if(y===0)context.moveTo(px,y);else context.lineTo(px,y);}context.stroke();
    }
  });
  const deckMaterial=standard(0xffffff,{map:woodTexture,roughness:.95});
  const boards=new THREE.InstancedMesh(new THREE.BoxGeometry(.123,.06,1.7),deckMaterial,12);root.add(boards);
  for(let i=0;i<12;i++){dummy.position.set((i-5.5)*.127,-.77,.62);dummy.rotation.set(0,0,0);dummy.scale.set(1,1,1);dummy.updateMatrix();boards.setMatrixAt(i,dummy.matrix);}
  const postMaterial=standard(0x796044),postGeometry=new THREE.CylinderGeometry(.035,.046,.45,8);
  for(const x of [-.72,.72])for(const z of [-.14,1.42]){const post=add(postGeometry,postMaterial);post.position.set(x,-.965,z);}

  const canopyTexture=canvasTexture(256,256,(context,w,h)=>{
    context.fillStyle='#d0d3b6';context.fillRect(0,0,w,h);
    for(let i=0;i<1500;i++){
      const x=random()*w,y=random()*h;context.fillStyle=i%3?'#53754228':'#f0e0ad38';
      context.beginPath();context.ellipse(x,y,2+random()*5,1+random()*3,random()*Math.PI,0,Math.PI*2);context.fill();
    }
  });
  const trunkMaterial=standard(0x6b5740),leafMaterial=standard(0xffffff,{map:canopyTexture}),trunkGeometry=new THREE.CylinderGeometry(.045,.095,1,10),leafGeometry=new THREE.SphereGeometry(1,20,14);
  const leafPositions=leafGeometry.attributes.position;
  for(let i=0;i<leafPositions.count;i++){
    const x=leafPositions.getX(i),y=leafPositions.getY(i),z=leafPositions.getZ(i);
    const uneven=1+Math.sin(x*11+z*7)*Math.sin(y*9-x*5)*.09;
    leafPositions.setXYZ(i,x*uneven,y*uneven,z*uneven);
  }
  leafGeometry.computeVertexNormals();
  const trunks=new THREE.InstancedMesh(trunkGeometry,trunkMaterial,64),leaves=new THREE.InstancedMesh(leafGeometry,leafMaterial,64*9);
  root.add(trunks,leaves);
  for(let i=0;i<64;i++){
    const sign=i%2?1:-1,z=i<20?-23-random()*8:-6-random()*19;
    let x=i<20?(random()-.5)*30:sign*(5+random()*11);
    while(shoreHeight(x,z)<-.72)x*=1.12;
    const y=shoreHeight(x,z);
    const height=3.4+random()*2.9,width=.9+random()*.9;
    dummy.position.set(x,y+height*.5,z);dummy.rotation.set(0,random()*Math.PI,sign*.04);dummy.scale.set(1,height,1);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
    for(let j=0;j<9;j++){
      const angle=j/9*Math.PI*2,reach=j%3===0?.18:.6,size=.45+random()*.28;
      dummy.position.set(x+Math.cos(angle)*width*reach,y+height*.74+random()*1.1,z+Math.sin(angle)*width*reach);dummy.scale.set(width*size,width*(size+.13),width*size);dummy.rotation.set(random()*.3,random()*Math.PI,random()*.25);dummy.updateMatrix();leaves.setMatrixAt(i*9+j,dummy.matrix);
      color.setHex(j%2?0x486b3d:0x73854a).multiplyScalar(.85+random()*.2);leaves.setColorAt(i*9+j,color);
    }
  }
  leaves.instanceColor.needsUpdate=true;
  const rocksGeometry=new THREE.SphereGeometry(1,10,7),rockPositions=rocksGeometry.attributes.position;
  for(let i=0;i<rockPositions.count;i++){const uneven=.85+.15*Math.sin(rockPositions.getX(i)*12+rockPositions.getZ(i)*8);rockPositions.setXYZ(i,rockPositions.getX(i)*uneven,rockPositions.getY(i)*uneven,rockPositions.getZ(i)*uneven);}rocksGeometry.computeVertexNormals();
  const rocks=new THREE.InstancedMesh(rocksGeometry,standard(0x8a8b78),48);root.add(rocks);
  for(let i=0;i<48;i++){
    const angle=random()*Math.PI*2,x=Math.cos(angle)*8*(.98+random()*.1),z=-9+Math.sin(angle)*12*(.98+random()*.1),scale=.12+random()*.37;
    dummy.position.set(x,Math.max(-.84,shoreHeight(x,z))+scale*.18,z);dummy.scale.set(scale,scale*.65,scale*.8);dummy.rotation.set(random()*.4,random()*6,random()*.3);dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);
  }
  const bladeGeometry=new THREE.BufferGeometry();bladeGeometry.setAttribute('position',new THREE.Float32BufferAttribute([-.012,0,0,.012,0,0,0,.18,.012,.012,0,0,.008,.36,.026,0,.18,.012],3));bladeGeometry.computeVertexNormals();
  const grassMaterial=standard(0x62763c,{side:THREE.DoubleSide}),grass=new THREE.InstancedMesh(bladeGeometry,grassMaterial,500);root.add(grass);
  grassMaterial.onBeforeCompile=shader=>{
    shader.uniforms.uWind={value:0};shader.vertexShader='uniform float uWind;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n transformed.x += sin(uWind*.8 + instanceMatrix[3].x*1.3 + instanceMatrix[3].z*.7)*position.y*.13;');grassMaterial.userData.shader=shader;
  };
  for(let i=0;i<500;i++){
    const angle=random()*Math.PI*2,edge=1.03+random()*.18,x=Math.cos(angle)*8*edge,z=-9+Math.sin(angle)*12*edge;
    dummy.position.set(x,shoreHeight(x,z),z);dummy.rotation.set(0,random()*6,0);dummy.scale.set(1,.7+random()*1.5,1);dummy.updateMatrix();grass.setMatrixAt(i,dummy.matrix);
    grass.setColorAt(i,color.setHex(i%3?0x859254:0x476b38));
  }

  const padShape=new THREE.Shape();padShape.moveTo(0,0);for(let i=0;i<=35;i++){const angle=.18+i/35*(Math.PI*2-.36);padShape.lineTo(Math.cos(angle),Math.sin(angle));}padShape.lineTo(0,0);
  const pads=new THREE.InstancedMesh(new THREE.ShapeGeometry(padShape),standard(0x6e894c,{side:THREE.DoubleSide}),28);root.add(pads);
  const lilyPositions=[];
  for(let i=0;i<28;i++){
    const x=(i%2?1:-1)*(1.25+random()*2.7),z=-.4-random()*4.5,scale=.12+random()*.11;lilyPositions.push({x,z});
    dummy.position.set(x,-.837,z);dummy.rotation.set(-Math.PI/2,0,random()*6);dummy.scale.set(scale,scale,scale);dummy.updateMatrix();pads.setMatrixAt(i,dummy.matrix);
  }
  const petals=new THREE.InstancedMesh(new THREE.SphereGeometry(1,12,8),standard(0xe4c3b9),8*7),centres=new THREE.InstancedMesh(new THREE.SphereGeometry(.016,8,6),standard(0xc7a45a),8);root.add(petals,centres);
  for(let i=0;i<8;i++){
    const {x,z}=lilyPositions[i*3];
    for(let j=0;j<7;j++){const angle=j/7*Math.PI*2;dummy.position.set(x+Math.cos(angle)*.032,-.815,z+Math.sin(angle)*.032);dummy.rotation.set(.14,-angle,0);dummy.scale.set(.055,.015,.02);dummy.updateMatrix();petals.setMatrixAt(i*7+j,dummy.matrix);}
    dummy.position.set(x,-.803,z);dummy.rotation.set(0,0,0);dummy.scale.set(1,1,1);dummy.updateMatrix();centres.setMatrixAt(i,dummy.matrix);
  }
  const motePositions=new Float32Array(44*3),moteBase=[];
  for(let i=0;i<44;i++){const point={x:(random()-.5)*13,y:-.4+random()*1.4,z:-5+random()*8};moteBase.push(point);motePositions.set([point.x,point.y,point.z],i*3);}
  const moteGeometry=new THREE.BufferGeometry();moteGeometry.setAttribute('position',new THREE.BufferAttribute(motePositions,3));
  const motes=new THREE.Points(moteGeometry,new THREE.PointsMaterial({map:glowTexture,color:0xf2deb3,size:.06,transparent:true,opacity:.65,depthWrite:false}));root.add(motes);
  const birds=[];
  for(let i=0;i<4;i++){
    const group=new THREE.Group(),material=new THREE.MeshBasicMaterial({color:0x516565,side:THREE.DoubleSide});root.add(group);
    const wings=[-1,1].map(sign=>{const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,sign*.11,.014,-.025,sign*.035,0,.035],3));const wing=new THREE.Mesh(geometry,material);group.add(wing);return {wing,sign};});birds.push({group,wings});
  }
  return {waterLevel:-.85,update(time,burst=0){
    waterMaterial.uniforms.uTime.value=time;
    if(grassMaterial.userData.shader)grassMaterial.userData.shader.uniforms.uWind.value=time;
    clouds.forEach((cloud,i)=>cloud.mesh.position.x=cloud.x+Math.sin(time*.006+i)*.5);
    for(let i=0;i<moteBase.length;i++){const p=moteBase[i];motePositions.set([p.x+Math.sin(time*.25+i)*.09,p.y+Math.sin(time*.4+i*2)*.06,p.z],i*3);}moteGeometry.attributes.position.needsUpdate=true;
    motes.material.opacity=.45+burst*.2;
    birds.forEach(({group,wings},i)=>{group.position.set(Math.sin(time*.065+i*1.4)*4.5,1.7+i*.22+Math.sin(time*.2+i)*.1,-9-i*1.2);group.rotation.y=Math.cos(time*.065+i*1.4)*.35;wings.forEach(({wing,sign})=>wing.rotation.z=sign*Math.sin(time*3+i)*.28);});
  }};
}
