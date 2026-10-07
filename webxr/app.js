import * as THREE from './vendor/three/three.module.min.js';
import {CHAINS, JOINTS, FINGER_LABELS, MATERIALS, fingerStates, handCue, cueRequest} from './logic.js';
import {emptyHands, readHandPoses} from './tracking.js';

const $ = id => document.getElementById(id);
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local');
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 20);
camera.position.set(0.40, 0.46, 0.62);
camera.lookAt(0, -0.02, -0.045);
const desktopCamera=camera.clone();
scene.add(new THREE.HemisphereLight(0xe8f6ff, 0x283b2d, 2.2));
const key = new THREE.DirectionalLight(0xffe8d6, 3.2);
key.position.set(-0.4, 0.7, 0.5);
scene.add(key);
const fill = new THREE.DirectionalLight(0x9dd9ea, 1.3);
fill.position.set(0.5, 0.3, -0.5);
scene.add(fill);

const stage = new THREE.Group();
scene.add(stage);
const bench = new THREE.Mesh(new THREE.BoxGeometry(0.74,0.03,0.38),
  new THREE.MeshStandardMaterial({color:0x233e3f, roughness:0.6}));
bench.position.set(0,-0.13,-0.07);
stage.add(bench);

function label(text, color='#c9e4dc') {
  const surface = document.createElement('canvas');
  surface.width=512; surface.height=96;
  const context=surface.getContext('2d');
  context.fillStyle=color; context.font='500 40px Segoe UI';
  context.textAlign='center'; context.textBaseline='middle';
  context.fillText(text,256,48);
  const texture=new THREE.CanvasTexture(surface);
  texture.colorSpace=THREE.SRGBColorSpace;
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(0.14,0.027),
    new THREE.MeshBasicMaterial({map:texture,transparent:true,side:THREE.DoubleSide,depthWrite:false}));
  return mesh;
}

const targets = MATERIALS.map((material, i) => {
  const x=(i-1)*0.185;
  const size=new THREE.Vector3(0.135,0.065,0.16);
  const position=new THREE.Vector3(x,-0.08,-0.07);
  const box=new THREE.Box3().setFromCenterAndSize(position,size);
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(size.x,size.y,size.z,3,1,3),
    new THREE.MeshStandardMaterial({color:material.color,roughness:i===0?0.18:0.85,metalness:i===0?0.25:0.02}));
  mesh.position.copy(position);
  stage.add(mesh);
  const name=label(material.name);
  name.position.set(x,-0.107,0.055);
  name.rotation.x=-Math.PI/2;
  stage.add(name);
  // Texture geometry is visual only; contact uses the block's box.
  if (i===1) {
    const bumpMaterial=new THREE.MeshStandardMaterial({color:0xc88b4d,roughness:1});
    const bumpGeometry=new THREE.SphereGeometry(0.004,6,4);
    for (let row=0; row<7; row++) for(let column=0; column<6; column++) {
      const bump=new THREE.Mesh(bumpGeometry,bumpMaterial);
      bump.position.set(x-0.049+column*0.019,-0.046,-0.128+row*0.019);
      bump.scale.y=0.4;
      stage.add(bump);
    }
  }
  if (i===2) {
    const seam=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.002,0.002),
      new THREE.MeshStandardMaterial({color:0xc5b9ea,roughness:1}));
    seam.position.set(x,-0.046,-0.115); stage.add(seam);
  }
  return {...material, x, box, mesh};
});

const skin=new THREE.MeshStandardMaterial({color:0xc89071,roughness:0.58});
const tipMaterial=new THREE.MeshStandardMaterial({color:0xdfab8b,roughness:0.53});
const jointGeometry=new THREE.SphereGeometry(1,10,8);
const boneGeometry=new THREE.CylinderGeometry(1,1,1,8);
function createHandRig() {
  const group=new THREE.Group();scene.add(group);
  const joints=new Map(JOINTS.map(name => {
    const mesh=new THREE.Mesh(jointGeometry,name.endsWith('tip')?tipMaterial:skin);
    mesh.visible=false;group.add(mesh);return [name,mesh];
  }));
  const bones=CHAINS.flatMap(chain=>chain.slice(1).map((name,i)=>{
    const mesh=new THREE.Mesh(boneGeometry,skin);
    mesh.visible=false;group.add(mesh);return {a:chain[i],b:name,mesh};
  }));
  const palm=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),skin);group.add(palm);
  return {group,joints,bones,palm};
}
const rigs={left:createHandRig(),right:createHandRig()};
const yAxis=new THREE.Vector3(0,1,0), direction=new THREE.Vector3();

function drawHand(poses,rig) {
  const {group,joints,bones,palm}=rig;
  group.visible=poses.size>0;
  for(const [name,mesh] of joints) {
    const pose=poses.get(name);
    mesh.visible=!!pose;
    if(pose) {
      mesh.position.set(pose.x,pose.y,pose.z);
      mesh.scale.setScalar(Math.min(0.02,Math.max(0.004,pose.radius || 0.008)));
    }
  }
  for(const bone of bones) {
    const a=poses.get(bone.a), b=poses.get(bone.b);
    bone.mesh.visible=!!a && !!b;
    if(!a || !b) continue;
    const start=new THREE.Vector3(a.x,a.y,a.z), end=new THREE.Vector3(b.x,b.y,b.z);
    direction.subVectors(end,start);
    const length=direction.length();
    if(length<0.0001){bone.mesh.visible=false;continue;}
    bone.mesh.position.copy(start).add(end).multiplyScalar(0.5);
    bone.mesh.quaternion.setFromUnitVectors(yAxis,direction.normalize());
    const radius=Math.min(a.radius || 0.007,b.radius || 0.007)*0.9;
    bone.mesh.scale.set(radius,length,radius);
  }
  const wrist=poses.get('wrist'), index=poses.get('index-finger-phalanx-proximal'),
    little=poses.get('pinky-finger-phalanx-proximal');
  palm.visible=!!wrist && !!index && !!little;
  if(palm.visible) {
    const w=new THREE.Vector3(wrist.x,wrist.y,wrist.z);
    const a=new THREE.Vector3(index.x,index.y,index.z), b=new THREE.Vector3(little.x,little.y,little.z);
    const center=a.clone().add(b).multiplyScalar(0.5);
    const z=w.clone().sub(center), x=a.clone().sub(b);
    const length=z.length(), width=x.length();
    if(length<0.001 || width<0.001) {palm.visible=false;return;}
    z.normalize();x.addScaledVector(z,-x.dot(z)).normalize();
    const y=new THREE.Vector3().crossVectors(z,x).normalize();
    palm.position.copy(w).add(center).multiplyScalar(0.5);
    palm.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));
    palm.scale.set(width+0.018,0.018,length);
  }
}
function drawHands() {
  for(const hand of ['left','right']) drawHand(hands[hand],rigs[hand]);
}

let previewTarget=0;
function previewPoses(hand) {
  const selected=hand===selectedHand();
  const amounts=FINGER_LABELS.map((_,i)=>selected?Number($('preview-curl-'+i).value)/100:0);
  const target=selected?previewTarget:(previewTarget+1)%3;
  const mirror=hand==='right'?1:-1;
  const root=new THREE.Vector3(targets[target].x+mirror*0.025,0.013,0.017);
  const poses=new Map();
  const put=(name,x,y,z,radius=0.008) => poses.set(name,{x:x*mirror+root.x,y:y+root.y,z:z+root.z,radius,orientation:new THREE.Quaternion()});
  put('wrist',0,0,0.035,0.012);
  CHAINS.slice(1).forEach((chain,i) => {
    const x=-0.026+i*0.021;
    put(chain[1],x,0,0.01,0.009);
    put(chain[2],x,0,-0.034,0.008);
    let y=0,z=-0.034;
    [0.034,0.024,0.019].forEach((length,j) => {
      const angle=amounts[i+1]*(j+1)*0.65;
      y-=Math.sin(angle)*length; z-=Math.cos(angle)*length;
      put(chain[j+3],x,y,z,0.007-j*0.0007);
    });
  });
  let thumbX=-0.038,thumbY=0,thumbZ=-0.005;
  put(CHAINS[0][1],thumbX,thumbY,thumbZ);
  CHAINS[0].slice(2).forEach((name,i)=>{
    const angle=amounts[0]*(i+1)*0.65;
    thumbX-=Math.cos(angle)*0.014;thumbY-=Math.sin(angle)*0.022;thumbZ-=Math.cos(angle)*0.017;
    put(name,thumbX,thumbY,thumbZ,0.008-i*0.0006);
  });
  return poses;
}

// The panel is part of the XR scene; normal HTML is not visible inside immersive VR.
const panelCanvas=document.createElement('canvas');
panelCanvas.width=1024; panelCanvas.height=768;
const panelContext=panelCanvas.getContext('2d');
const panelTexture=new THREE.CanvasTexture(panelCanvas);
panelTexture.colorSpace=THREE.SRGBColorSpace;
const panel=new THREE.Mesh(new THREE.PlaneGeometry(0.55,0.4125),
  new THREE.MeshBasicMaterial({map:panelTexture,transparent:true,side:THREE.DoubleSide}));
panel.position.set(0,0.30,-0.26); panel.visible=false; stage.add(panel);

let source='desktop-preview', trackingValid=false, hands=emptyHands(), poses=new Map(),
  calculated=handCue(new Map(),[],[]), fingers=fingerStates(new Map()),
  accepted=null, status={received:null,board:null}, lastPost=0,
  postBusy=false, queuedZero=false, pollBusy=false, statusAt=0, positioned=false, lastFrame=0, lastPanel=0,
  xrSupported=false;
const inverseStage=new THREE.Matrix4();
const selectedHand=() => $('hand').value;

function readXR(frame) {
  hands=emptyHands();
  const session=renderer.xr.getSession();
  if(!session || session.visibilityState!=='visible') return;
  const space=renderer.xr.getReferenceSpace();
  if(!space) return;
  const viewer=frame.getViewerPose(space);
  if(!positioned && viewer) {
    const viewerPosition=viewer.transform.position;
    const q=viewer.transform.orientation;
    const forward=new THREE.Vector3(0,0,-1).applyQuaternion(new THREE.Quaternion(q.x,q.y,q.z,q.w));
    forward.y=0;
    if(forward.lengthSq()<0.01) forward.set(0,0,-1);
    forward.normalize();
    stage.position.set(viewerPosition.x+forward.x*0.45,viewerPosition.y-0.27,viewerPosition.z+forward.z*0.45);
    stage.rotation.y=Math.atan2(-forward.x,-forward.z);
    positioned=true; stage.updateMatrixWorld(true);
  }
  hands=readHandPoses(frame,space,session.inputSources);
}

function calculate() {
  const previouslyTracked=trackingValid;
  const previousFingerValidity=fingers.valid;
  poses=hands[selectedHand()];
  fingers=fingerStates(poses);
  trackingValid=source==='webxr' && fingers.valid.some(Boolean);
  if((previouslyTracked && !trackingValid) || previousFingerValidity.some((valid,i)=>valid && !fingers.valid[i])) sendCue(true);
  stage.updateMatrixWorld(true);
  inverseStage.copy(stage.matrixWorld).invert();
  const localPoses=new Map();
  for(const chain of CHAINS) {
    const name=chain.at(-1),tip=poses.get(name);
    if(!tip) continue;
    const point=new THREE.Vector3(tip.x,tip.y,tip.z).applyMatrix4(inverseStage);
    localPoses.set(name,{x:point.x,y:point.y,z:point.z,radius:tip.radius});
  }
  calculated=handCue(localPoses,targets,fingers.valid);
  for(const target of targets) {
    const touching=calculated.contacts.includes(target.name);
    target.mesh.material.emissive.setHex(touching?target.color:0);
    target.mesh.material.emissiveIntensity=touching?0.24:0;
  }
}

async function sendCue(forceZero=false) {
  const now=performance.now();
  if(postBusy) {if(forceZero)queuedZero=true;return;}
  if(!forceZero && now-lastPost<50) return;
  lastPost=now; postBusy=true;
  const request=cueRequest(calculated,source,selectedHand(),forceZero?false:trackingValid);
  try {
    const result=await fetch('/api/cue',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(request),
      signal:AbortSignal.timeout(1000)});
    const value=await result.json();
    accepted=result.ok && value.accepted ? {sequence:value.sequence,time:performance.now()} : null;
    if(!result.ok) $('accepted-value').textContent='Request rejected';
  } catch {accepted=null;} finally {
    postBusy=false;
    if(queuedZero) {queuedZero=false;sendCue(true);}
  }
}
async function pollStatus() {
  if(pollBusy) return;
  pollBusy=true;
  const requestedAt=performance.now();
  try {
    const result=await fetch('/api/status',{signal:AbortSignal.timeout(1000)});
    if(!result.ok) throw new Error('Relay unavailable');
    status=await result.json();
    // Count the entire round trip conservatively rather than showing a delayed
    // network snapshot as freshly received board/monitor telemetry.
    statusAt=requestedAt;
  } catch {status={received:null,board:null};} finally {pollBusy=false;}
}
setInterval(pollStatus,200);

function zeroTracking() {
  hands=emptyHands();poses=new Map();trackingValid=false;fingers=fingerStates(poses);
  calculated=handCue(poses,[],[]);
  sendCue(true);
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)zeroTracking();});
// A stopped XR frame cannot refresh a calculated contact indefinitely.
setInterval(()=>{
  if(source==='webxr' && performance.now()-lastFrame>150) {zeroTracking();drawHands();updateUI();}
},100);

function updateUI() {
  $('source-badge').textContent=source==='webxr'?'QUEST HAND TRACKING':'DESKTOP PREVIEW';
  $('preview-controls').hidden=source==='webxr';
  $('all-hands-value').textContent=source==='webxr'?'Right '+hands.right.size+'/25 · Left '+hands.left.size+'/25':'Both hands simulated';
  $('pose-value').textContent=source!=='webxr'?'Simulated':fingers.valid.filter(Boolean).length+'/5 finger poses available';
  for(let i=0;i<5;i++) {
    $('curl-'+i).textContent=fingers.curls[i]===null?'—':Math.round(fingers.curls[i]*100)+'%';
    $('finger-cue-'+i).textContent=fingers.valid[i]?'Cue '+calculated.duties[i]:'Pose missing';
    $('finger-cue-'+i).title=calculated.contacts[i] || 'No contact';
  }
  const wrist=poses.get('wrist');
  if(source==='webxr' && wrist) {
    const euler=new THREE.Euler().setFromQuaternion(wrist.orientation,'YXZ');
    $('wrist-value').textContent=[euler.x,euler.y,euler.z].map(v=>Math.round(THREE.MathUtils.radToDeg(v))+'°').join(' / ');
  } else $('wrist-value').textContent=source==='webxr'?'Unavailable':'Simulated';
  const touching=[...new Set(calculated.contacts.filter(Boolean))];
  const peak=Math.max(...calculated.duties);
  $('contact-value').textContent=touching.join(' · ') || 'None';
  $('cue-value').textContent=peak;
  $('cue-bar').style.width=(peak/255*100)+'%';
  $('pattern-value').textContent=touching.length ? calculated.contacts.map((contact,i)=>contact?FINGER_LABELS[i]+': '+contact:null).filter(Boolean).join(' · ') : 'No contact';
  const acceptedFresh=accepted && performance.now()-accepted.time<1000;
  $('accepted-value').textContent=acceptedFresh?'Packet '+accepted.sequence:'Not connected';
  const statusAge=performance.now()-statusAt;
  const received=status.received && status.received.ageMs+statusAge<500 ? status.received : null;
  $('received-value').textContent=received?received.duties.join(' / '):'No fresh echo';
  const board=status.board && status.board.ageMs+statusAge<200 ? status.board : null;
  $('applied-value').textContent=board?board.vibration.join(' / ')+' · mask '+board.motor_mask:'No fresh telemetry';
  const now=performance.now();
  if(now-lastPanel>150) {
    lastPanel=now;
    panelContext.clearRect(0,0,1024,768);
    panelContext.fillStyle='rgba(13,35,39,.96)'; panelContext.fillRect(0,0,1024,768);
    panelContext.fillStyle='#dceee5'; panelContext.font='600 48px Segoe UI';
    panelContext.fillText('AHAM / FULL HAND v2',40,65);
    panelContext.font='30px Segoe UI';
    const lines=[$('all-hands-value').textContent,
      'Feedback: '+selectedHand()+' · '+$('pose-value').textContent,
      'Finger order: Thumb / Index / Middle / Ring / Little',
      'Curl %: '+fingers.curls.map(value=>value===null?'—':Math.round(value*100)).join(' / '),
      'Cue /255: '+calculated.duties.join(' / '),
      'Contact: '+(touching.join(' · ') || 'None'),
      'Bridge received: '+$('received-value').textContent,
      'Board reports: '+$('applied-value').textContent,
      'Monitor-only cues · Servo control pending'];
    lines.forEach((line,i)=>panelContext.fillText(line,40,135+i*57));
    panelTexture.needsUpdate=true;
  }
}

async function checkXR() {
  if(!window.isSecureContext) {
    $('xr-status').textContent='Wireless Quest access requires HTTPS. Laptop localhost preview works here.';
    $('enter-vr').textContent='HTTPS required for VR';return;
  }
  if(!navigator.xr) {
    $('xr-status').textContent='Preview ready. Open this page in Quest Browser for hand tracking.';
    $('enter-vr').textContent='Open on Quest to enter VR';return;
  }
  try {xrSupported=await navigator.xr.isSessionSupported('immersive-vr');} catch {xrSupported=false;}
  $('enter-vr').disabled=!xrSupported;
  $('enter-vr').textContent=xrSupported?'Enter VR':'Open on Quest to enter VR';
  $('xr-status').textContent=xrSupported?'Use hand tracking in Quest settings, then enter VR.':'Desktop preview ready. A VR headset is required for live hand data.';
}

$('enter-vr').addEventListener('click',async()=>{
  const current=renderer.xr.getSession();
  if(current){await current.end();return;}
  $('enter-vr').disabled=true;
  let session;
  try {
    session=await navigator.xr.requestSession('immersive-vr',{requiredFeatures:['hand-tracking']});
    session.addEventListener('visibilitychange',()=>{if(session.visibilityState!=='visible')zeroTracking();});
    session.addEventListener('end',()=>{
      zeroTracking(); source='desktop-preview'; positioned=false; panel.visible=false;
      stage.position.set(0,0,0); stage.rotation.set(0,0,0);
      camera.position.copy(desktopCamera.position);camera.quaternion.copy(desktopCamera.quaternion);
      camera.fov=desktopCamera.fov;camera.near=desktopCamera.near;camera.far=desktopCamera.far;
      const rect=canvas.getBoundingClientRect();
      renderer.setSize(rect.width,rect.height,false);
      camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();
      $('enter-vr').textContent='Enter VR';$('enter-vr').disabled=!xrSupported;
      $('xr-status').textContent='VR ended. Desktop preview sends zero output.';
    });
    await renderer.xr.setSession(session);
    source='webxr';zeroTracking();positioned=false;panel.visible=true;
    $('enter-vr').textContent='Exit VR';$('enter-vr').disabled=false;
    $('xr-status').textContent='VR active. Both hands tracked; every fingertip of the feedback hand can touch a surface.';
  } catch(error) {
    if(session) await session.end().catch(()=>{});
    $('xr-status').textContent='Could not start hand tracking: '+error.message;
    $('enter-vr').disabled=!xrSupported;
  }
});
$('hand').addEventListener('change',zeroTracking);
$('open-hand').addEventListener('click',()=>{for(let i=0;i<5;i++)$('preview-curl-'+i).value='0';});
$('close-hand').addEventListener('click',()=>{for(let i=0;i<5;i++)$('preview-curl-'+i).value='100';});
document.querySelectorAll('[data-target]').forEach(button=>button.addEventListener('click',()=>{
  previewTarget=Number(button.dataset.target);
  document.querySelectorAll('[data-target]').forEach(item=>item.classList.toggle('active',item===button));
}));
document.querySelector('[data-target="0"]').classList.add('active');
new ResizeObserver(()=>{
  if(renderer.xr.isPresenting) return;
  const rect=canvas.getBoundingClientRect();
  renderer.setSize(rect.width,rect.height,false);
  camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();
}).observe(canvas.parentElement);
renderer.setAnimationLoop((time,frame)=>{
  if(frame && renderer.xr.isPresenting) {
    source='webxr';lastFrame=performance.now();readXR(frame);
  } else if(!renderer.xr.isPresenting) {
    source='desktop-preview';hands={left:previewPoses('left'),right:previewPoses('right')};
  }
  calculate();drawHands();updateUI();sendCue();renderer.render(scene,camera);
});
checkXR();pollStatus();
