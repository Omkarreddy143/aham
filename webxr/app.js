import * as THREE from './vendor/three/three.module.min.js';
import {CHAINS, JOINTS, FINGER_LABELS, fingerStates, handCue, cueRequest} from './logic.js';
import {emptyHands, readHandPoses} from './tracking.js';
import {FoundryGame, graspInput, CORES, CORE_Z, DOCK_Z} from './game.js';
import {createWorld} from './world.js';

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
camera.position.set(0.66, 0.53, 0.87);
camera.lookAt(0, -0.015, -0.065);
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
const game=new FoundryGame();
const world=createWorld(stage), targets=world.targets;

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

let previewTarget=0, previewLift=0, previewDock=false;
function previewPoses(hand) {
  const selected=hand===selectedHand();
  const amounts=FINGER_LABELS.map((_,i)=>selected?Number($('preview-curl-'+i).value)/100:0);
  const target=selected?previewTarget:(previewTarget+1)%3;
  const mirror=hand==='right'?1:-1;
  const root=new THREE.Vector3(CORES[target].x+mirror*0.012,0.013+(selected?previewLift:0),
    CORE_Z+0.015+(selected && previewDock?DOCK_Z-CORE_Z:0));
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
panelCanvas.width=1280; panelCanvas.height=640;
const panelContext=panelCanvas.getContext('2d');
const panelTexture=new THREE.CanvasTexture(panelCanvas);
panelTexture.colorSpace=THREE.SRGBColorSpace;
const panel=new THREE.Mesh(new THREE.PlaneGeometry(0.76,0.38),
  new THREE.MeshBasicMaterial({map:panelTexture,transparent:true,side:THREE.DoubleSide}));
panel.position.set(0,0.32,-0.43); panel.visible=false; stage.add(panel);

let source='desktop-preview', trackingValid=false, hands=emptyHands(), poses=new Map(),
  calculated=handCue(new Map(),[],[]), fingers=fingerStates(new Map()),
  accepted=null, status={received:null,board:null}, lastPost=0,
  postBusy=false, queuedZero=false, pollBusy=false, statusAt=0, positioned=false, lastFrame=0, lastPanel=0,
  xrSupported=false, gameTracked=false, lastAnimation=null, restartTouch=0, restartLatched=false,
  gripBusy=false, gripZeroQueued=false, lastGripPost=0;
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

function localHand(input) {
  const result=new Map(), inverseRotation=stage.quaternion.clone().invert();
  for(const [name,pose] of input) {
    const p=new THREE.Vector3(pose.x,pose.y,pose.z).applyMatrix4(inverseStage);
    const q=pose.orientation;
    const orientation=q?inverseRotation.clone().multiply(new THREE.Quaternion(q.x,q.y,q.z,q.w)):null;
    result.set(name,{x:p.x,y:p.y,z:p.z,radius:pose.radius,orientation});
  }
  return result;
}
function calculate(delta,time) {
  const previouslyTracked=trackingValid;
  const previousFingerValidity=fingers.valid;
  poses=hands[selectedHand()];
  fingers=fingerStates(poses);
  trackingValid=source==='webxr' && fingers.valid.some(Boolean);
  if(source==='webxr' && ((previouslyTracked && !trackingValid) || previousFingerValidity.some((valid,i)=>valid && !fingers.valid[i]))) sendCue(true);
  stage.updateMatrixWorld(true);
  inverseStage.copy(stage.matrixWorld).invert();
  const localPoses=localHand(poses), right=localHand(hands.right), input=graspInput(right);
  const wasTracked=gameTracked;gameTracked=!!input.valid;
  const hadResistance=game.resistance.some(Boolean);
  game.step(delta,input);world.update(game,time);
  if(source==='webxr' && ((wasTracked && !gameTracked) || (hadResistance && !game.resistance.some(Boolean)))) sendGrip(true);
  // Reachable inside VR: hold the right index tip on the illuminated button.
  const index=right.get('index-finger-tip');
  const touchingRestart=input.valid && index && new THREE.Vector3(index.x,index.y,index.z).distanceTo(world.restart.position)<.043 && !game.held;
  restartTouch=touchingRestart?restartTouch+Math.min(delta,.04):0;
  if(!touchingRestart)restartLatched=false;
  if(restartTouch>.7 && !restartLatched){resetGame();restartLatched=true;}
  world.button.material.emissiveIntensity=.15+Math.min(1,restartTouch/.7)*.7;
  calculated=handCue(localPoses,targets.filter((_,i)=>game.objects[i].state!=='delivered'),fingers.valid);
  if(game.held && selectedHand()==='right' && game.resistance.some(Boolean)) {
    // Grasp contact is inferred from the gesture, rather than five tip overlaps.
    calculated={duties:fingers.valid.map(valid=>valid?game.held.duty:0),patterns:fingers.valid.map(valid=>valid?game.held.pattern:0),contacts:fingers.valid.map(valid=>valid?game.held.name+' grip':null)};
  }
}

async function sendGrip(forceZero=false) {
  // Desktop viewers poll receipts; they must not overwrite a live Quest request.
  // A queued live-session zero may still finish after that session has ended.
  if(source!=='webxr' && !forceZero)return;
  if(gripBusy){if(forceZero)gripZeroQueued=true;return;}
  const now=performance.now();if(!forceZero && now-lastGripPost<75)return;
  lastGripPost=now;gripBusy=true;
  try {
    await fetch('/api/grip-preview',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(game.intent(source,!forceZero && gameTracked)),signal:AbortSignal.timeout(1000)});
  } catch {} finally {gripBusy=false;if(gripZeroQueued){gripZeroQueued=false;sendGrip(true);}}
}
function resetGame(){game.reset();previewLift=0;previewDock=false;for(let i=0;i<5;i++)$('preview-curl-'+i).value='0';if(source==='webxr')sendGrip(true);}

async function sendCue(forceZero=false) {
  if(source!=='webxr' && !forceZero)return;
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
  game.suspend();gameTracked=false;restartTouch=0;
  if(source==='webxr'){sendGrip(true);sendCue(true);}
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)zeroTracking();});
// A stopped XR frame cannot refresh a calculated contact indefinitely.
setInterval(()=>{
  if(source==='webxr' && performance.now()-lastFrame>150) {zeroTracking();drawHands();updateUI();}
},100);

function updateUI() {
  $('game-score').textContent=game.score.toLocaleString();$('game-time').textContent=Math.ceil(game.remaining)+'s';
  $('game-combo').textContent=game.combo?'×'+(1+Math.min(4,game.combo-1)*.25).toFixed(2):'×1';
  $('game-best').textContent=game.best.toLocaleString();
  $('game-message').textContent=game.message;
  $('held-value').textContent=game.held?game.held.name+' · '+game.held.mass+' kg (virtual)':game.phase==='over'?'Shift complete':'No core held';
  for(let i=0;i<5;i++) {
    $('resistance-'+i).textContent=game.resistance[i]+'%';
    $('resistance-bar-'+i).style.height=game.resistance[i]+'%';
  }
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
  $('accepted-value').textContent=source!=='webxr'?'Read-only preview':acceptedFresh?'Packet '+accepted.sequence:'Not connected';
  const statusAge=performance.now()-statusAt;
  const received=status.received && status.received.ageMs+statusAge<500 ? status.received : null;
  $('received-value').textContent=received?received.duties.join(' / '):'No fresh echo';
  const board=status.board && status.board.ageMs+statusAge<200 ? status.board : null;
  $('applied-value').textContent=board?board.vibration.join(' / ')+' · mask '+board.motor_mask:'No fresh telemetry';
  const grip=status.resistance && status.resistance.ageMs+statusAge<500?status.resistance:null;
  $('grip-received').textContent=grip?grip.resistance.join(' / ')+'% · output OFF':'No fresh preview receipt';
  const now=performance.now();
  if(now-lastPanel>150) {
    lastPanel=now;
    panelContext.clearRect(0,0,1280,640);
    panelContext.fillStyle='rgba(8,24,39,.97)'; panelContext.fillRect(0,0,1280,640);
    panelContext.fillStyle='#69e8ce'; panelContext.font='600 36px Segoe UI';
    panelContext.fillText('AHAM / ORBIT FOUNDRY v3',45,60);
    panelContext.fillStyle='#f1f3e8';panelContext.font='600 65px Segoe UI';
    panelContext.fillText(game.score+' PTS',45,145);panelContext.fillText(Math.ceil(game.remaining)+'s',640,145);
    panelContext.font='29px Segoe UI';
    const lines=[game.message,'Close around a core OR pinch. Lift 8 cm. Open over matching dock.',
      'RIGHT: '+hands.right.size+'/25 joints · '+game.deliveries+' delivered · Best '+game.best,
      'Finger order: Thumb / Index / Middle / Ring / Little',
      'Resistance request %: '+game.resistance.join(' / '),
      'Vibration cue /255: '+calculated.duties.join(' / '),
      'Bridge: '+$('received-value').textContent,
      'Laptop resistance: '+$('grip-received').textContent,
      'SERVO OUTPUT OFF · Touch NEW SHIFT for 0.7s to restart'];
    lines.forEach((line,i)=>panelContext.fillText(line,45,210+i*46,1190));
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
    source='webxr';zeroTracking();resetGame();positioned=false;panel.visible=true;lastAnimation=null;
    $('enter-vr').textContent='Exit VR';$('enter-vr').disabled=false;
    $('xr-status').textContent='VR active. Open your right hand first, then grab, lift and deliver cores. The first grab starts the shift.';
  } catch(error) {
    if(session) await session.end().catch(()=>{});
    $('xr-status').textContent='Could not start hand tracking: '+error.message;
    $('enter-vr').disabled=!xrSupported;
  }
});
$('hand').addEventListener('change',zeroTracking);
$('open-hand').addEventListener('click',()=>{for(let i=0;i<5;i++)$('preview-curl-'+i).value='0';});
$('close-hand').addEventListener('click',()=>{for(let i=0;i<5;i++)$('preview-curl-'+i).value='100';});
$('lift-core').addEventListener('click',()=>{previewLift=.18;});
$('move-dock').addEventListener('click',()=>{previewDock=true;});
$('release-core').addEventListener('click',()=>{for(let i=0;i<5;i++)$('preview-curl-'+i).value='0';});
$('reset-game').addEventListener('click',resetGame);
document.querySelectorAll('[data-target]').forEach(button=>button.addEventListener('click',()=>{
  previewTarget=Number(button.dataset.target);
  previewLift=0;previewDock=false;
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
  const delta=lastAnimation===null?0:(time-lastAnimation)/1000;lastAnimation=time;
  if(frame && renderer.xr.isPresenting) {
    source='webxr';lastFrame=performance.now();readXR(frame);
  } else if(!renderer.xr.isPresenting) {
    source='desktop-preview';hands={left:previewPoses('left'),right:previewPoses('right')};
  }
  calculate(delta,time);drawHands();updateUI();sendCue();sendGrip();renderer.render(scene,camera);
});
checkXR();pollStatus();
