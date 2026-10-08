import * as THREE from './vendor/three/three.module.min.js';
import {CHAINS, JOINTS, FINGER_LABELS, fingerStates, handCue, cueRequest} from './logic.js';
import {emptyHands, readHandPoses} from './tracking.js';
import {FoundryGame, graspInput, CORES, CORE_Z, DOCK_Z} from './game.js';
import {createWorld} from './world.js';
import {fetchJSON} from './network.js';

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
const boneStart=new THREE.Vector3(),boneEnd=new THREE.Vector3(),palmWrist=new THREE.Vector3(),
  palmIndex=new THREE.Vector3(),palmLittle=new THREE.Vector3(),palmCenter=new THREE.Vector3(),
  palmX=new THREE.Vector3(),palmY=new THREE.Vector3(),palmZ=new THREE.Vector3(),palmBasis=new THREE.Matrix4();

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
    const start=boneStart.set(a.x,a.y,a.z), end=boneEnd.set(b.x,b.y,b.z);
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
    const w=palmWrist.set(wrist.x,wrist.y,wrist.z);
    const a=palmIndex.set(index.x,index.y,index.z), b=palmLittle.set(little.x,little.y,little.z);
    const center=palmCenter.copy(a).add(b).multiplyScalar(0.5);
    const z=palmZ.copy(w).sub(center), x=palmX.copy(a).sub(b);
    const length=z.length(), width=x.length();
    if(length<0.001 || width<0.001) {palm.visible=false;return;}
    z.normalize();x.addScaledVector(z,-x.dot(z)).normalize();
    const y=palmY.crossVectors(z,x).normalize();
    palm.position.copy(w).add(center).multiplyScalar(0.5);
    palm.quaternion.setFromRotationMatrix(palmBasis.makeBasis(x,y,z));
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
panelCanvas.width=1280; panelCanvas.height=420;
const panelContext=panelCanvas.getContext('2d');
const panelTexture=new THREE.CanvasTexture(panelCanvas);
panelTexture.colorSpace=THREE.SRGBColorSpace;
const panel=new THREE.Mesh(new THREE.PlaneGeometry(0.72,0.236),
  new THREE.MeshBasicMaterial({map:panelTexture,transparent:true,side:THREE.DoubleSide,depthWrite:false}));
panel.position.set(0,0.30,-0.51); panel.visible=false; stage.add(panel);

let source='desktop-preview', trackingValid=false, hands=emptyHands(), poses=new Map(),
  calculated=handCue(new Map(),[],[]), fingers=fingerStates(new Map()),
  accepted=null, status={received:null,board:null}, lastPost=0,
  postBusy=false, queuedZero=false, pollBusy=false, statusAt=0, positioned=false, lastFrame=0, lastPanel=0,lastUI=0,
  xrSupported=false, gameTracked=false, lastAnimation=null, restartTouch=0, restartLatched=false,
  gripBusy=false, gripZeroQueued=false, lastGripPost=0, connectionError='';
const inverseStage=new THREE.Matrix4();
const localPoint=new THREE.Vector3(),localRotation=new THREE.Quaternion(),restartPoint=new THREE.Vector3();
const selectedHand=() => $('hand').value;
// A temporary HTTPS tunnel can exceed one second per round trip. This only
// bounds the HTTP request; relay freshness and ESP output leases stay unchanged.
const FEEDBACK_REQUEST_TIMEOUT_MS=3000;

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
    const p=localPoint.set(pose.x,pose.y,pose.z).applyMatrix4(inverseStage);
    const q=pose.orientation;
    // Only the wrist orientation is needed by grasping. Drawing uses raw poses.
    const orientation=q && name==='wrist'?inverseRotation.clone().multiply(localRotation.set(q.x,q.y,q.z,q.w)):null;
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
  const right=localHand(hands.right),localPoses=selectedHand()==='right'?right:localHand(poses),input=graspInput(right);
  const wasTracked=gameTracked;gameTracked=!!input.valid;
  const hadResistance=game.resistance.some(Boolean);
  game.step(delta,input);world.update(game,time);
  if(source==='webxr' && ((wasTracked && !gameTracked) || (hadResistance && !game.resistance.some(Boolean)))) sendGrip(true);
  // Reachable inside VR: hold the right index tip on the illuminated button.
  const index=right.get('index-finger-tip');
  const touchingRestart=input.valid && index && restartPoint.set(index.x,index.y,index.z).distanceTo(world.restart.position)<.043 && !game.held;
  restartTouch=touchingRestart?restartTouch+Math.min(delta,.04):0;
  if(!touchingRestart)restartLatched=false;
  if(restartTouch>.7 && !restartLatched){resetGame();restartLatched=true;}
  world.updateRestart(Math.min(1,restartTouch/.7),touchingRestart);
  calculated=handCue(localPoses,targets.filter((_,i)=>game.objects[i].state!=='delivered'),fingers.valid,calculated.contacts,.003);
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
    await fetchJSON('/api/grip-preview',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(game.intent(source,!forceZero && gameTracked))},FEEDBACK_REQUEST_TIMEOUT_MS);
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
    const {response:result,value}=await fetchJSON('/api/cue',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(request)},FEEDBACK_REQUEST_TIMEOUT_MS);
    accepted=result.ok && value.accepted ? {sequence:value.sequence,time:performance.now(),roundTripMs:performance.now()-now} : null;
    connectionError=result.ok?'':String(value.error || 'HTTP '+result.status).slice(0,80);
    if(!result.ok) $('accepted-value').textContent='Request rejected';
  } catch(error) {
    accepted=null;connectionError=error.name==='AbortError'?'Request timeout':String(error.message || error).slice(0,80);
  } finally {
    postBusy=false;
    if(queuedZero) {queuedZero=false;sendCue(true);}
  }
}
async function pollStatus() {
  if(pollBusy) return;
  pollBusy=true;
  const requestedAt=performance.now();
  try {
    const {response:result,value}=await fetchJSON('/api/status',{},FEEDBACK_REQUEST_TIMEOUT_MS);
    if(!result.ok) throw new Error('Relay unavailable');
    status=value;
    // Count the entire round trip conservatively rather than showing a delayed
    // network snapshot as freshly received board/monitor telemetry.
    statusAt=requestedAt;
  } catch {status={received:null,board:null};} finally {pollBusy=false;}
}
// Receipts are diagnostics, independent of the full-rate render/gesture loop.
setInterval(pollStatus,500);

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
  const now=performance.now();
  // HTML is invisible in an immersive session. Keep work on the XR scene.
  if(renderer.xr.isPresenting || now-lastUI<100) return;
  lastUI=now;
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
}

function nextAction() {
  if(game.phase==='over')return ['SHIFT COMPLETE','Touch NEW SHIFT to play again.'];
  if(!gameTracked)return ['SHOW YOUR RIGHT HAND','Keep your hand in front of the headset.'];
  if(game.paused || (!game.held && !game.canGrab))return ['OPEN YOUR HAND','Then reach for a core.'];
  if(game.held) {
    if(!game.held.lifted)return ['LIFT THE CORE','Raise it 8 cm above the cradle.'];
    return game.dockAligned?['OPEN HERE','Release over the glowing matching dock.']:
      ['MATCH THE DOCK','Carry '+game.held.name+' to its matching color.'];
  }
  if(game.hovered)return ['GRAB '+game.hovered.name.toUpperCase(),'Pinch or close your hand around it.'];
  return ['REACH FOR A CORE','Grab · lift · match · release.'];
}

function updatePanel(time) {
  if(!panel.visible || time-lastPanel<125)return;
  lastPanel=time;
  const ctx=panelContext,[action,hint]=nextAction();
  ctx.clearRect(0,0,1280,420);
  ctx.fillStyle='rgba(9,24,35,.96)';ctx.beginPath();ctx.roundRect(0,0,1280,420,32);ctx.fill();
  ctx.strokeStyle='#70d9c344';ctx.lineWidth=2;ctx.stroke();
  ctx.fillStyle='#8be6cd';ctx.font='600 24px Segoe UI';ctx.fillText('AHAM / ORBIT FOUNDRY',40,43);
  ctx.textAlign='right';ctx.fillStyle=gameTracked?'#b8f2dd':'#ffd49b';
  ctx.fillText(gameTracked?'RIGHT HAND READY':'TRACKING PAUSED',1240,43);ctx.textAlign='left';
  ctx.fillStyle='#f1fff9';ctx.font='600 62px Segoe UI';ctx.fillText(game.score+' PTS',40,124);
  ctx.fillStyle=game.remaining<15?'#ffc28f':'#f1fff9';ctx.fillText(Math.ceil(game.remaining)+'s',510,124);
  ctx.fillStyle='#99b6bf';ctx.font='30px Segoe UI';ctx.fillText(game.deliveries+' DELIVERED',830,119);
  ctx.fillStyle='#5bcdb1';ctx.fillRect(40,151,1200*(game.remaining/75),4);
  ctx.fillStyle='#f1fff9';ctx.font='600 43px Segoe UI';ctx.fillText(action,40,218);
  ctx.fillStyle='#bad0d7';ctx.font='30px Segoe UI';ctx.fillText(hint,40,267);
  ctx.fillStyle='#809fa9';ctx.font='23px Segoe UI';ctx.fillText(game.held?game.held.name.toUpperCase()+' / '+game.held.mass+' kg virtual':'3 CORES / 75 SECONDS',40,323);
  ctx.fillText('BEST '+game.best+'  /  COMBO ×'+(1+Math.min(4,Math.max(0,game.combo-1))*.25).toFixed(2),40,374);
  FINGER_LABELS.forEach((name,i)=>{
    const x=785+i*88;ctx.fillStyle='#203c48';ctx.fillRect(x,309,62,8);
    ctx.fillStyle='#8be6cd';ctx.fillRect(x,309,62*game.resistance[i]/80,8);
    ctx.fillStyle='#a5c1cb';ctx.font='19px Segoe UI';ctx.fillText(name,x,346);
  });
  const relayLive=accepted && performance.now()-accepted.time<1000;
  const relayLabel=source!=='webxr'?'HAPTIC PREVIEW':relayLive?(accepted.roundTripMs<250?'RELAY LIVE':'RELAY SLOW'):'RELAY LOST';
  ctx.fillStyle=source!=='webxr'?'#809fa9':relayLive?'#8be6cd':'#ffc28f';
  ctx.font='19px Segoe UI';ctx.fillText(relayLabel,785,374);
  if(source==='webxr' && !relayLive && connectionError) {
    ctx.fillStyle='#ffc28f';ctx.font='16px Segoe UI';ctx.fillText(connectionError.slice(0,44),785,399);
  }
  panelTexture.needsUpdate=true;
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
      canvas.parentElement.classList.remove('hud-visible');$('hud-preview').textContent='Preview VR panel';
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
    $('hand').value='right';canvas.parentElement.classList.remove('hud-visible');
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
$('hud-preview').addEventListener('click',()=>{
  if(renderer.xr.isPresenting)return;
  panel.visible=!panel.visible;
  $('hud-preview').textContent=panel.visible?'Hide VR panel':'Preview VR panel';
  canvas.parentElement.classList.toggle('hud-visible',panel.visible);
  if(panel.visible){camera.position.set(0,.27,1.05);camera.lookAt(0,.09,-.08);}
  else {camera.position.copy(desktopCamera.position);camera.quaternion.copy(desktopCamera.quaternion);}
});
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
  calculate(delta,time);drawHands();updateUI();updatePanel(time);sendCue();sendGrip();renderer.render(scene,camera);
});
checkXR();pollStatus();
