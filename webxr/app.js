import * as THREE from './vendor/three/three.module.min.js';
import {CHAINS, JOINTS, MATERIALS, curl, indexCue, cueRequest} from './logic.js';

const $ = id => document.getElementById(id);
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local');
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 20);
camera.position.set(0.33, 0.40, 0.52);
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
const joints=new Map(JOINTS.map(name => {
  const mesh=new THREE.Mesh(jointGeometry,name.endsWith('tip')?tipMaterial:skin);
  mesh.visible=false; scene.add(mesh); return [name,mesh];
}));
const bones=CHAINS.flatMap(chain => chain.slice(1).map((name,i) => {
  const mesh=new THREE.Mesh(boneGeometry,skin);
  mesh.visible=false; scene.add(mesh); return {a:chain[i],b:name,mesh};
}));
const palm=new THREE.Mesh(new THREE.BoxGeometry(0.075,0.019,0.066),skin);
scene.add(palm);
const yAxis=new THREE.Vector3(0,1,0), direction=new THREE.Vector3();

function drawHand(poses) {
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
  const wrist=poses.get('wrist'), knuckle=poses.get('middle-finger-phalanx-proximal');
  palm.visible=!!wrist && !!knuckle;
  if(palm.visible) {
    palm.position.set((wrist.x+knuckle.x)/2,(wrist.y+knuckle.y)/2,(wrist.z+knuckle.z)/2);
    // Hand geometry is an approximate joint rig. Bone positions are the real data.
    palm.quaternion.copy(wrist.orientation || new THREE.Quaternion());
  }
}

let previewTarget=0;
function previewPoses() {
  const amount=Number($('preview-curl').value)/100;
  const root=new THREE.Vector3(targets[previewTarget].x+0.025,0.013,0.017);
  const poses=new Map();
  const put=(name,x,y,z,radius=0.008) => poses.set(name,{x:x+root.x,y:y+root.y,z:z+root.z,radius,orientation:new THREE.Quaternion()});
  put('wrist',0,0,0.035,0.012);
  CHAINS.slice(1).forEach((chain,i) => {
    const x=-0.026+i*0.021;
    put(chain[1],x,0,0.01,0.009);
    put(chain[2],x,0,-0.034,0.008);
    let y=0,z=-0.034;
    [0.034,0.024,0.019].forEach((length,j) => {
      const angle=i===0 ? amount*(j+1)*0.65 : 0.10*(j+1);
      y-=Math.sin(angle)*length; z-=Math.cos(angle)*length;
      put(chain[j+3],x,y,z,0.007-j*0.0007);
    });
  });
  CHAINS[0].slice(1).forEach((name,i) => put(name,-0.04-i*0.013,-0.003-i*0.002,0.015-i*0.014));
  return poses;
}

// The panel is part of the XR scene; normal HTML is not visible inside immersive VR.
const panelCanvas=document.createElement('canvas');
panelCanvas.width=1024; panelCanvas.height=512;
const panelContext=panelCanvas.getContext('2d');
const panelTexture=new THREE.CanvasTexture(panelCanvas);
panelTexture.colorSpace=THREE.SRGBColorSpace;
const panel=new THREE.Mesh(new THREE.PlaneGeometry(0.50,0.25),
  new THREE.MeshBasicMaterial({map:panelTexture,transparent:true,side:THREE.DoubleSide}));
panel.position.set(0,0.18,-0.235); panel.visible=false; stage.add(panel);

let source='desktop-preview', trackingValid=false, poses=new Map(),
  calculated={duties:[0,0,0,0,0],patterns:[0,0,0,0,0],contact:null},
  curlValue=null, accepted=null, status={received:null,board:null}, lastPost=0,
  postBusy=false, queuedZero=false, pollBusy=false, statusAt=0, positioned=false, lastFrame=0, lastPanel=0,
  xrSupported=false;
const inverseStage=new THREE.Matrix4();
const selectedHand=() => $('hand').value;

function readXR(frame) {
  poses=new Map();
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
  const input=Array.from(session.inputSources).find(item => item.hand && item.handedness===selectedHand());
  if(!input) return;
  for(const name of JOINTS) {
    const jointSpace=input.hand.get(name);
    if(!jointSpace) continue;
    const pose=frame.getJointPose(jointSpace,space);
    if(!pose) continue;
    const p=pose.transform.position, q=pose.transform.orientation;
    if(![p.x,p.y,p.z,q.x,q.y,q.z,q.w].every(Number.isFinite)) continue;
    poses.set(name,{x:p.x,y:p.y,z:p.z,radius:pose.radius || 0.008,
      orientation:new THREE.Quaternion(q.x,q.y,q.z,q.w),emulatedPosition:pose.emulatedPosition});
  }
}

function calculate() {
  const previouslyTracked=trackingValid;
  const complete=CHAINS[1].every(name => poses.has(name));
  trackingValid=source==='webxr' && complete;
  if(previouslyTracked && !trackingValid) sendCue(true);
  curlValue=complete ? curl(CHAINS[1].slice(1).map(name=>poses.get(name))) : null;
  stage.updateMatrixWorld(true);
  inverseStage.copy(stage.matrixWorld).invert();
  const localPoses=new Map();
  const tip=poses.get('index-finger-tip');
  if(tip) {
    const point=new THREE.Vector3(tip.x,tip.y,tip.z).applyMatrix4(inverseStage);
    localPoses.set('index-finger-tip',{x:point.x,y:point.y,z:point.z,radius:tip.radius});
  }
  calculated=indexCue(localPoses,targets,complete);
  for(const target of targets) {
    target.mesh.material.emissive.setHex(target.name===calculated.contact?target.color:0);
    target.mesh.material.emissiveIntensity=target.name===calculated.contact?0.24:0;
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
  poses=new Map(); trackingValid=false; curlValue=null;
  calculated={duties:[0,0,0,0,0],patterns:[0,0,0,0,0],contact:null};
  sendCue(true);
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)zeroTracking();});
// A stopped XR frame cannot refresh a calculated contact indefinitely.
setInterval(()=>{
  if(source==='webxr' && performance.now()-lastFrame>150) {zeroTracking();drawHand(poses);updateUI();}
},100);

function updateUI() {
  $('source-badge').textContent=source==='webxr'?'QUEST HAND TRACKING':'DESKTOP PREVIEW';
  $('preview-controls').hidden=source==='webxr';
  $('pose-value').textContent=source!=='webxr'?'Simulated':trackingValid?'Index pose available':'Index pose missing';
  $('curl-value').textContent=curlValue===null?'—':Math.round(curlValue*100)+'%';
  const wrist=poses.get('wrist');
  if(source==='webxr' && wrist) {
    const euler=new THREE.Euler().setFromQuaternion(wrist.orientation,'YXZ');
    $('wrist-value').textContent=[euler.x,euler.y,euler.z].map(v=>Math.round(THREE.MathUtils.radToDeg(v))+'°').join(' / ');
  } else $('wrist-value').textContent=source==='webxr'?'Unavailable':'Simulated';
  $('contact-value').textContent=calculated.contact || 'None';
  $('cue-value').textContent=calculated.duties[1];
  $('cue-bar').style.width=(calculated.duties[1]/255*100)+'%';
  $('pattern-value').textContent=calculated.contact ? 'Pattern '+calculated.patterns[1]+' · '+calculated.contact : 'No contact';
  $('preview-value').textContent=$('preview-curl').value+'%';
  const acceptedFresh=accepted && performance.now()-accepted.time<1000;
  $('accepted-value').textContent=acceptedFresh?'Packet '+accepted.sequence:'Not connected';
  const statusAge=performance.now()-statusAt;
  const received=status.received && status.received.ageMs+statusAge<500 ? status.received : null;
  $('received-value').textContent=received?received.duties[1]+'/255 · pattern '+received.patterns[1]:'Not connected';
  const board=status.board && status.board.ageMs+statusAge<200 ? status.board : null;
  $('applied-value').textContent=board?board.vibration[1]+'/255 · mask '+board.motor_mask:'Not connected';
  const now=performance.now();
  if(now-lastPanel>150) {
    lastPanel=now;
    panelContext.clearRect(0,0,1024,512);
    panelContext.fillStyle='rgba(13,35,39,.96)'; panelContext.fillRect(0,0,1024,512);
    panelContext.fillStyle='#dceee5'; panelContext.font='600 48px Segoe UI';
    panelContext.fillText('AHAM / FEEDBACK MONITOR',40,65);
    panelContext.font='32px Segoe UI';
    const lines=[selectedHand()+' hand · '+$('pose-value').textContent,
      'Index curl '+$('curl-value').textContent+' · '+(calculated.contact||'No contact'),
      'Calculated cue '+calculated.duties[1]+'/255 · pattern '+calculated.patterns[1],
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
    $('xr-status').textContent='VR active. Touch the surfaces with your selected index finger.';
  } catch(error) {
    if(session) await session.end().catch(()=>{});
    $('xr-status').textContent='Could not start hand tracking: '+error.message;
    $('enter-vr').disabled=!xrSupported;
  }
});
$('hand').addEventListener('change',zeroTracking);
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
    source='desktop-preview';poses=previewPoses();
  }
  calculate();drawHand(poses);updateUI();sendCue();renderer.render(scene,camera);
});
checkXR();pollStatus();
