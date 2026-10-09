import * as THREE from './vendor/three/three.module.min.js';
import {emptyHands,readHandPoses} from './tracking.js';
import {Journey,PHASES,DURATION,touchesLight} from './witness-logic.js';
import {TrackedHand,SKIN_TONES} from './realistic-hand.js';
import {createNaturalGarden} from './witness-world.js';
import {GardenAudio} from './witness-audio.js';
import {GardenInteractions,BOWL} from './witness-interactions.js';
import {GardenPlay} from './witness-play.js';

// This experience deliberately has no relay, serial or actuator transport.
const $=id=>document.getElementById(id);
const canvas=$('garden'),journey=new Journey();
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
renderer.xr.enabled=true;renderer.xr.setReferenceSpaceType('local');
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
const scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0xb1c1b5,.024);
const camera=new THREE.PerspectiveCamera(48,1,.01,65);
camera.position.set(.44,.28,1.05);camera.lookAt(0,.04,-.9);
const previewCamera=camera.clone();
scene.add(new THREE.HemisphereLight(0xe6eee1,0x586047,1.7));
const sun=new THREE.DirectionalLight(0xffe2b8,2.5);sun.position.set(-9,7,-16);scene.add(sun);
const root=new THREE.Group();scene.add(root);
const mat=(color,options={})=>new THREE.MeshStandardMaterial({color,roughness:.65,...options});
const basic=(color,options={})=>new THREE.MeshBasicMaterial({color,...options});
function mesh(geometry,material,parent=root){const object=new THREE.Mesh(geometry,material);parent.add(object);return object;}
const flat=(object,x,y,z)=>{object.rotation.x=-Math.PI/2;object.position.set(x,y,z);return object;};

const glowCanvas=document.createElement('canvas');glowCanvas.width=128;glowCanvas.height=128;
const glowContext=glowCanvas.getContext('2d'),glowGradient=glowContext.createRadialGradient(64,64,0,64,64,64);
glowGradient.addColorStop(0,'#ffffffcc');glowGradient.addColorStop(.22,'#ffffff65');glowGradient.addColorStop(.55,'#ffffff18');glowGradient.addColorStop(1,'#ffffff00');
glowContext.fillStyle=glowGradient;glowContext.fillRect(0,0,128,128);
const glowTexture=new THREE.CanvasTexture(glowCanvas);
function glow(parent,color,size){const object=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture,color,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));object.scale.set(size,size,1);parent.add(object);return object;}

const world=createNaturalGarden(root);
const interaction=new GardenInteractions(),play=new GardenPlay(root);

function label(text,width=.19,height=.045,color='#e7d9bc'){
  const c=document.createElement('canvas');c.width=640;c.height=128;
  const context=c.getContext('2d');context.fillStyle=color;context.font='500 46px Segoe UI, sans-serif';context.textAlign='center';context.textBaseline='middle';context.fillText(text,320,64);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;
  return mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:t,transparent:true,side:THREE.DoubleSide,depthWrite:false}));
}
const colors=[0xa9e5d5,0xf0cf90,0xbab3ed],names=['BODY','MIND','WITNESS'];
const orbGeometry=new THREE.SphereGeometry(.045,20,12);
const orbs=colors.map((color,i)=>{
  const group=new THREE.Group();root.add(group);group.position.set((i-1)*.24,0,.04);
  const sphere=mesh(orbGeometry,mat(color,{emissive:color,emissiveIntensity:.8,metalness:.28,roughness:.2}),group);
  const halo=mesh(new THREE.SphereGeometry(.062,16,10),basic(color,{transparent:true,opacity:.13,depthWrite:false}),group);
  glow(group,color,.25);
  const ring=mesh(new THREE.TorusGeometry(.077,.0025,5,36),basic(color),group);ring.rotation.x=.6;
  const title=label(names[i],.13,.032);root.remove(title);group.add(title);title.position.set(0,-.12,0);
  return {group,sphere,halo,ring,color,world:new THREE.Vector3(),touching:false,pulse:0};
});
const rippleGeometry=new THREE.RingGeometry(.93,1,48);
const ripples=Array.from({length:12},()=>{
  const material=basic(0xf0cf90,{transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false});
  const object=flat(mesh(rippleGeometry,material),0,world.waterLevel+.006,0);object.visible=false;return {object,life:0};
});
let rippleIndex=0,formIndex=0,burst=0,nextFormAt=PHASES[2].start+8;

const audio=new GardenAudio();
async function unlockAudio(){try{await audio.start();}catch{ $('garden-status').textContent='The garden is ready. Audio could not start; the visual journey still works.';}}

const rigs={left:new TrackedHand(scene,'left'),right:new TrackedHand(scene,'right')};
let handPreviewCurl=null,handCameraClose=false,skinTone=SKIN_TONES.warm;
function drawHand(poses,rig){rig.update(poses);}
function previewHand(side,time){return rigs[side].preview(time,{curl:handPreviewCurl});}

// A small, legible canvas panel is rendered in 3D: HTML is absent in immersive VR.
const panelCanvas=document.createElement('canvas');panelCanvas.width=1400;panelCanvas.height=430;
const panelContext=panelCanvas.getContext('2d'),panelTexture=new THREE.CanvasTexture(panelCanvas);panelTexture.colorSpace=THREE.SRGBColorSpace;
const panel=mesh(new THREE.PlaneGeometry(1.02,.313),new THREE.MeshBasicMaterial({map:panelTexture,transparent:true,side:THREE.DoubleSide,depthWrite:false}));panel.position.set(0,.42,-.65);panel.visible=false;
const captionCanvas=document.createElement('canvas');captionCanvas.width=1400;captionCanvas.height=155;
const captionContext=captionCanvas.getContext('2d'),captionTexture=new THREE.CanvasTexture(captionCanvas);captionTexture.colorSpace=THREE.SRGBColorSpace;
const captionPanel=mesh(new THREE.PlaneGeometry(1.02,.113),new THREE.MeshBasicMaterial({map:captionTexture,transparent:true,side:THREE.DoubleSide,depthWrite:false}));captionPanel.position.set(0,.20,-.65);captionPanel.visible=false;
const nextLabel=label('NEXT',.10,.028),restartLabel=label('RESTART',.13,.028);
const controls=[{name:'next',x:.13,object:nextLabel},{name:'restart',x:-.13,object:restartLabel}].map(item=>{
  item.object.position.set(item.x,.145,.012);
  const body=mesh(new THREE.BoxGeometry(.18,.053,.018),mat(0x244b50,{emissive:0x183a3d}));body.position.set(item.x,.145,.002);
  return {...item,body,world:new THREE.Vector3(),touching:false};
});
let hands=emptyHands(),anchored=false,lastTime=0,lastUI=0,activePhase=-1,previewPanel=false,touchCount=0;
let activity='Pinch a seed, carry it over the bowl, then open your fingers.',lastCaption='',narratedPhase=-1;
const viewerRotation=new THREE.Quaternion(),forward=new THREE.Vector3();
const inverseRoot=new THREE.Matrix4(),localPoint=new THREE.Vector3();
function begin(){audio.stop();narratedPhase=-1;journey.start();activePhase=-1;formIndex=0;nextFormAt=PHASES[2].start+8;touchCount=0;burst=0;interaction.reset();play.reset();activity=PHASES[0].action;for(const orb of orbs)orb.touching=false;}
function activateOrb(index){
  const orb=orbs[index];orb.pulse=1;burst=1;touchCount++;
  const ripple=ripples[rippleIndex++%ripples.length];ripple.life=1;ripple.object.visible=true;ripple.object.position.set(orb.group.position.x,world.waterLevel+.006,orb.group.position.z-.5);ripple.object.material.color.setHex(orb.color);
  audio.chime([392,523.25,659.25][index]);
  if(journey.phase===2){formIndex=(formIndex+1)%3;nextFormAt=journey.elapsed+8;}
}
function updateStyle(){
  const phase=journey.phase;
  if(phase!==activePhase){activePhase=phase;formIndex=0;nextFormAt=journey.elapsed+8;activity=PHASES[phase].action;audio.chime([261.63,329.63,392,261.63][phase],.10,3);if(phase===3&&journey.running){play.petalOrigin.set(0,.06,-.18);play.petalLife=1;}}
  if(journey.running&&phase!==narratedPhase&&audio.context){narratedPhase=phase;audio.narrate(phase);}
  if(phase===2 && journey.running && journey.elapsed>=nextFormAt){formIndex=(formIndex+1)%3;nextFormAt=journey.elapsed+8;}
  const form=phase===2?formIndex:0;
  for(const rig of Object.values(rigs))rig.setAppearance({phase,form,skin:skinTone,burst});
}
function clockText(){const remaining=Math.ceil(DURATION-journey.elapsed);return `${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`;}
function updatePanel(){
  const phase=PHASES[journey.phase],finished=journey.finished;
  panelContext.clearRect(0,0,1400,430);panelContext.fillStyle='#0b2531e8';panelContext.fillRect(0,0,1400,430);
  panelContext.fillStyle='#d9bd82';panelContext.font='500 24px Segoe UI, sans-serif';panelContext.fillText(`AHAM / WITNESS GARDEN     ${String(journey.phase+1).padStart(2,'0')} / ${phase.label}`,45,48);
  panelContext.font='52px Georgia, serif';panelContext.fillStyle='#f0e3c7';panelContext.fillText(finished?'The journey ends. The question remains.':phase.title,45,121);
  panelContext.font='27px Segoe UI, sans-serif';panelContext.fillStyle='#d0e1d7';panelContext.fillText(finished?'The hand and the thought “mine” are both noticed.':phase.action,45,182);
  panelContext.font='26px Segoe UI, sans-serif';panelContext.fillStyle='#b6cecb';panelContext.fillText(finished?'Tattva: reflect on the awareness of body and mind.':phase.question,45,235);
  panelContext.fillStyle='#ffffff15';panelContext.fillRect(45,272,1310,4);panelContext.fillStyle='#d9bd82';panelContext.fillRect(45,272,1310*journey.elapsed/DURATION,4);
  const live=renderer.xr.isPresenting,tracked=hands.left.size+hands.right.size;
  panelContext.font='23px Segoe UI, sans-serif';panelContext.fillStyle='#a9c9c1';panelContext.fillText(live?(tracked?`LIVE QUEST / L ${hands.left.size} · R ${hands.right.size} JOINTS`:'HANDS LOST / BRING HANDS INTO VIEW'):'DESKTOP REHEARSAL / SIMULATED HANDS',45,327);
  panelContext.fillStyle='#f0dfba';panelContext.font='35px Segoe UI, sans-serif';panelContext.textAlign='right';panelContext.fillText(clockText(),1355,52);panelContext.textAlign='left';
  panelContext.font='23px Segoe UI, sans-serif';panelContext.fillStyle='#e0c992';panelContext.fillText(activity,45,384);panelTexture.needsUpdate=true;
  const caption=audio.caption()||phase.question;
  if(caption!==lastCaption){
    lastCaption=caption;$('voice-caption').textContent=caption;
    captionContext.clearRect(0,0,1400,155);captionContext.fillStyle='#0b2531ef';captionContext.fillRect(0,0,1400,155);
    captionContext.fillStyle='#b9cbbd';captionContext.font='19px Segoe UI, sans-serif';captionContext.fillText('AI VOICE GUIDE',35,31);
    captionContext.fillStyle='#f4ead2';captionContext.font='30px Segoe UI, sans-serif';
    const words=caption.split(' ');let line='',y=77;
    for(const word of words){if(captionContext.measureText(line+word).width>1310){captionContext.fillText(line,35,y);line='';y+=39;}line+=word+' ';}captionContext.fillText(line,35,y);captionTexture.needsUpdate=true;
  }
  captionPanel.visible=panel.visible;
}
function updateUI(){
  const phase=PHASES[journey.phase];$('journey-time').textContent=clockText();$('journey-progress').style.width=`${journey.elapsed/DURATION*100}%`;
  $('phase-title').textContent=journey.finished?'The journey ends. The question remains.':journey.running?phase.title:'A moment to arrive.';
  $('phase-action').textContent=journey.finished?'The hand and the thought “mine” are both noticed. Reflect on the awareness of both.':journey.running?phase.action:'Enter VR, or press Start to rehearse the two-minute journey.';
  document.querySelectorAll('[data-phase]').forEach(element=>element.classList.toggle('active',Number(element.dataset.phase)===journey.phase));
  $('tracking-source').textContent=renderer.xr.isPresenting?`LIVE QUEST · L ${hands.left.size} / R ${hands.right.size} JOINTS`:'DESKTOP · SIMULATED HANDS';
  $('activity-status').textContent=activity;$('voice-status').textContent=audio.status();
  updatePanel();
}
function resize(){if(renderer.xr.isPresenting)return;const bounds=canvas.parentElement.getBoundingClientRect();renderer.setSize(bounds.width,bounds.height,false);camera.aspect=bounds.width/bounds.height;camera.updateProjectionMatrix();}
new ResizeObserver(resize).observe(canvas.parentElement);resize();
$('restart-journey').addEventListener('click',async()=>{await unlockAudio();begin();});
$('next-phase').addEventListener('click',()=>{unlockAudio();journey.next();});
$('preview-touch').addEventListener('click',()=>{unlockAudio();if(!journey.running&&!journey.finished)begin();activateOrb(touchCount%3);});
$('preview-form').addEventListener('click',()=>{unlockAudio();journey.elapsed=PHASES[2].start;journey.running=true;activePhase=2;formIndex=(formIndex+1)%3;});
$('skin-tone').addEventListener('change',event=>{skinTone=SKIN_TONES[event.target.value]??SKIN_TONES.warm;});
$('hands-open').addEventListener('click',()=>{handPreviewCurl=0;});
$('hands-close').addEventListener('click',()=>{handPreviewCurl=.95;});
$('inspect-hands').addEventListener('click',()=>{
  handCameraClose=!handCameraClose;
  if(handCameraClose){camera.position.set(.12,.18,.62);camera.lookAt(0,-.07,.07);}
  else{camera.position.copy(previewCamera.position);camera.quaternion.copy(previewCamera.quaternion);}
  $('inspect-hands').textContent=handCameraClose?'View the landscape':'Inspect hands';
});
$('preview-panel').addEventListener('click',()=>{previewPanel=!previewPanel;panel.visible=previewPanel;});
function onActivity(event){
  if(event.type==='grab'){activity='Seed held · move above the bowl and open your fingers.';activateOrb(event.seed);}
  if(event.type==='plant'){play.plant(event.point);burst=1;audio.chime(659,.20,2.5);activity=`A flower grew from your action · ${interaction.flowers} planted.`;}
  if(event.type==='release')activity='Try releasing above the glowing bowl.';
  if(event.type==='cancel')activity='Hand tracking lost · seed returned. Open your hand to begin again.';
  if(event.type==='paint'){play.paint(event.from,event.to);activity='Your intention leaves a trace. Notice the thought “mine”.';}
  if(event.type==='mandala'){play.join(event.point);formIndex=(formIndex+1)%3;nextFormAt=journey.elapsed+8;burst=1;audio.chime(392,.16,3);audio.chime(587,.10,3);activity='The form changed. Separate your hands, then bring them together again.';}
}
$('preview-plant').addEventListener('click',()=>{unlockAudio();if(!journey.running)begin();journey.elapsed=0;updateStyle();interaction.flowers++;onActivity({type:'plant',point:{x:BOWL.x,y:BOWL.y+.10,z:BOWL.z}});});
$('preview-draw').addEventListener('click',()=>{unlockAudio();if(!journey.running)begin();journey.elapsed=PHASES[1].start;updateStyle();play.previewTrail();activity='Desktop preview · a ribbon follows the pointing gesture.';});
$('preview-join').addEventListener('click',()=>{unlockAudio();if(!journey.running)begin();journey.elapsed=PHASES[2].start;updateStyle();onActivity({type:'mandala',point:{x:0,y:.07,z:-.07}});});
$('music-volume').addEventListener('input',event=>{audio.volume=Number(event.target.value)/100;audio.applyVolume();});
$('mute-music').addEventListener('click',()=>{audio.muted=!audio.muted;audio.applyVolume();$('mute-music').textContent=audio.muted?'Music off':'Music on';$('mute-music').setAttribute('aria-pressed',String(audio.muted));if(!audio.muted)unlockAudio();});
$('guide-volume').addEventListener('input',event=>{audio.voiceVolume=Number(event.target.value)/100;audio.applyVolume();});
$('mute-guide').addEventListener('click',()=>{audio.voiceEnabled=!audio.voiceEnabled;audio.applyVolume();$('mute-guide').textContent=audio.voiceEnabled?'Voice on':'Voice off';$('mute-guide').setAttribute('aria-pressed',String(!audio.voiceEnabled));});
$('replay-guide').addEventListener('click',async()=>{await unlockAudio();if(!audio.guide)audio.ready=audio.loadGuide();narratedPhase=journey.phase;audio.narrate(journey.phase);});
renderer.xr.addEventListener('sessionend',()=>{
  audio.stop();interaction.reset();
  journey.running=false;anchored=false;hands=emptyHands();root.position.set(0,0,0);root.rotation.set(0,0,0);panel.visible=previewPanel;$('garden-rehearsal').hidden=false;
  camera.position.copy(previewCamera.position);camera.quaternion.copy(previewCamera.quaternion);$('enter-garden').disabled=false;$('garden-status').textContent='VR ended. Select Enter VR to begin a fresh journey.';resize();
});
async function checkVR(){
  try{
    await Promise.all(Object.values(rigs).map(rig=>rig.ready));
    const supported=!!navigator.xr&&await navigator.xr.isSessionSupported('immersive-vr');
    $('enter-garden').disabled=!supported;$('enter-garden').textContent=supported?'Enter VR · begin journey':'Open this page in Quest Browser';
    $('garden-status').textContent=supported?'Ready. Put controllers aside and use both hands.':'Desktop rehearsal is ready. Press Start to explore light, music and the story.';
  }catch{$('enter-garden').textContent='VR unavailable in this browser';$('garden-status').textContent='Desktop rehearsal is ready. Open the HTTPS page in Quest Browser for VR.';}
}
$('enter-garden').addEventListener('click',async()=>{
  unlockAudio();$('enter-garden').disabled=true;
  try{
    const session=await navigator.xr.requestSession('immersive-vr',{requiredFeatures:['hand-tracking']});
    await renderer.xr.setSession(session);anchored=false;lastTime=0;begin();panel.visible=true;$('garden-rehearsal').hidden=true;$('garden-status').textContent='Journey running. Pinch seeds, draw with an index finger, and bring open hands together.';
  }catch(error){$('enter-garden').disabled=false;$('garden-status').textContent=`Could not enter VR: ${error.message}. Check Quest hand tracking, then try again.`;}
});
checkVR();
renderer.setAnimationLoop((time,frame)=>{
  const seconds=time/1000,delta=lastTime?Math.max(0,seconds-lastTime):0;lastTime=seconds;
  const session=renderer.xr.getSession(),live=renderer.xr.isPresenting;
  const visible=!document.hidden&&(!live||session?.visibilityState==='visible');
  audio.setPaused(!visible);
  journey.advance(delta,visible);
  if(live){
    hands=emptyHands();
    if(frame&&visible){
      const reference=renderer.xr.getReferenceSpace(),viewer=frame.getViewerPose(reference);
      if(viewer&&!anchored){
        const p=viewer.transform.position,q=viewer.transform.orientation;viewerRotation.set(q.x,q.y,q.z,q.w);forward.set(0,0,-1).applyQuaternion(viewerRotation);forward.y=0;forward.normalize();
        const yaw=Math.atan2(-forward.x,-forward.z);root.position.set(p.x+forward.x*.52,p.y-.32,p.z+forward.z*.52);root.rotation.y=yaw;anchored=true;
      }
      hands=readHandPoses(frame,reference,session.inputSources);
    }
  }else hands={left:previewHand('left',seconds),right:previewHand('right',seconds)};
  updateStyle();for(const side of ['left','right'])drawHand(hands[side],rigs[side]);
  root.updateMatrixWorld(true);
  const localHands={left:new Map(),right:new Map()};
  if(live&&visible){inverseRoot.copy(root.matrixWorld).invert();for(const side of ['left','right'])for(const [name,p] of hands[side]){localPoint.set(p.x,p.y,p.z).applyMatrix4(inverseRoot);localHands[side].set(name,{...p,x:localPoint.x,y:localPoint.y,z:localPoint.z});}}
  for(const event of interaction.update(localHands,delta,journey.phase,live&&visible&&journey.running))onActivity(event);
  if(interaction.charge>0&&!interaction.joined)activity=`Hold both open hands here · ${Math.round(interaction.charge*100)}%`;
  orbs.forEach((orb,index)=>{const seed=interaction.seeds[index];orb.group.position.set(seed.position.x,seed.position.y,seed.position.z);orb.group.visible=seed.cooldown<=0;});
  for(const orb of orbs){
    orb.group.getWorldPosition(orb.world);
    const touching=live&&visible&&['left','right'].some(side=>touchesLight(hands[side],orb.world,.045,orb.touching?.012:0));
    if(touching&&!orb.touching)activateOrb(orbs.indexOf(orb));orb.touching=touching;
    orb.pulse=Math.max(0,orb.pulse-delta*.9);orb.sphere.scale.setScalar(1+orb.pulse*.35);orb.halo.scale.setScalar(1+orb.pulse*1.5);orb.halo.material.opacity=.12+orb.pulse*.22;orb.ring.rotation.z=seconds*.2;
  }
  for(const control of controls){
    control.body.visible=control.object.visible=panel.visible;
    control.body.getWorldPosition(control.world);
    const touching=live&&visible&&['left','right'].some(side=>touchesLight(hands[side],control.world,.045,control.touching?.012:0));
    if(touching&&!control.touching){if(control.name==='restart')begin();else journey.next();audio.chime(784,.08,.5);}control.touching=touching;
  }
  for(const ripple of ripples){
    ripple.life=Math.max(0,ripple.life-delta*.32);ripple.object.visible=ripple.life>0;
    if(ripple.life>0){ripple.object.scale.setScalar(.045+(1-ripple.life)*.8);ripple.object.material.opacity=ripple.life*.55;}
  }
  burst=Math.max(0,burst-delta*.6);world.update(seconds,burst);play.update(delta,seconds,interaction,journey.phase);
  if(time-lastUI>150){updateUI();lastUI=time;}
  renderer.render(scene,camera);
});
window.addEventListener('pagehide',()=>audio.close(),{once:true});
