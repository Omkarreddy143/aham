import * as THREE from './vendor/three/three.module.min.js';
import {emptyHands,readHandPoses} from './tracking.js';
import {Journey,PHASES,DURATION,touchesLight} from './witness-logic.js';
import {TrackedHand,SKIN_TONES} from './realistic-hand.js';
import {createNaturalGarden} from './witness-world.js';

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
let rippleIndex=0,formIndex=0,burst=0,nextFormAt=103;

class GardenAudio {
  constructor(){this.context=null;this.volume=.3;this.muted=false;this.step=0;}
  async start(){
    const AudioContext=window.AudioContext||window.webkitAudioContext;
    if(!AudioContext)return;
    if(!this.context){
      this.context=new AudioContext();this.master=this.context.createGain();this.master.gain.value=0;this.master.connect(this.context.destination);
      const filter=this.context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=850;filter.connect(this.master);
      [130.81,196,261.63].forEach((frequency,i)=>{
        const oscillator=this.context.createOscillator(),gain=this.context.createGain();
        oscillator.type='sine';oscillator.frequency.value=frequency;gain.gain.value=[.085,.035,.025][i];oscillator.connect(gain);gain.connect(filter);oscillator.start();
      });
      this.timer=setInterval(()=>{
        if(this.context.state==='running' && journey.running)this.chime([261.63,329.63,392,440,523.25,440,392,329.63][this.step++%8],.055,3.5);
      },2800);
    }
    await this.context.resume();this.applyVolume();
  }
  applyVolume(){if(this.master)this.master.gain.setTargetAtTime(this.muted?0:this.volume,this.context.currentTime,.12);}
  chime(frequency=523.25,strength=.18,duration=1.8){
    if(!this.context || this.context.state!=='running')return;
    const now=this.context.currentTime;
    [1,2.004].forEach((harmonic,i)=>{
      const oscillator=this.context.createOscillator(),gain=this.context.createGain();
      oscillator.type='sine';oscillator.frequency.value=frequency*harmonic;gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(strength/(i+1),now+.025);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
      oscillator.connect(gain);gain.connect(this.master);oscillator.start(now);oscillator.stop(now+duration+.05);
      oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
    });
  }
}
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
const nextLabel=label('NEXT',.10,.028),restartLabel=label('RESTART',.13,.028);
const controls=[{name:'next',x:.13,object:nextLabel},{name:'restart',x:-.13,object:restartLabel}].map(item=>{
  item.object.position.set(item.x,.145,.012);
  const body=mesh(new THREE.BoxGeometry(.18,.053,.018),mat(0x244b50,{emissive:0x183a3d}));body.position.set(item.x,.145,.002);
  return {...item,body,world:new THREE.Vector3(),touching:false};
});
let hands=emptyHands(),anchored=false,lastTime=0,lastUI=0,activePhase=-1,previewPanel=false,touchCount=0;
const viewerRotation=new THREE.Quaternion(),forward=new THREE.Vector3();
function begin(){journey.start();activePhase=-1;formIndex=0;nextFormAt=103;touchCount=0;burst=0;for(const orb of orbs)orb.touching=false;}
function activateOrb(index){
  const orb=orbs[index];orb.pulse=1;burst=1;touchCount++;
  const ripple=ripples[rippleIndex++%ripples.length];ripple.life=1;ripple.object.visible=true;ripple.object.position.set(orb.group.position.x,world.waterLevel+.006,orb.group.position.z-.5);ripple.object.material.color.setHex(orb.color);
  audio.chime([392,523.25,659.25][index]);
  if(journey.phase===2){formIndex=(formIndex+1)%3;nextFormAt=journey.elapsed+8;}
}
function updateStyle(){
  const phase=journey.phase;
  if(phase!==activePhase){activePhase=phase;formIndex=0;nextFormAt=journey.elapsed+8;audio.chime([261.63,329.63,392,261.63][phase],.10,3);}
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
  panelContext.font='23px Segoe UI, sans-serif';panelContext.fillStyle='#99b9b2';panelContext.fillText(journey.phase===3?'“The body is the field; the one who knows it is the knower.” · Gita 13.2':'Touch NEXT below to advance · RESTART to begin again',45,384);panelTexture.needsUpdate=true;
}
function updateUI(){
  const phase=PHASES[journey.phase];$('journey-time').textContent=clockText();$('journey-progress').style.width=`${journey.elapsed/DURATION*100}%`;
  $('phase-title').textContent=journey.finished?'The journey ends. The question remains.':journey.running?phase.title:'A moment to arrive.';
  $('phase-action').textContent=journey.finished?'The hand and the thought “mine” are both noticed. Reflect on the awareness of both.':journey.running?phase.action:'Enter VR, or press Start to rehearse the three-minute journey.';
  document.querySelectorAll('[data-phase]').forEach(element=>element.classList.toggle('active',Number(element.dataset.phase)===journey.phase));
  $('tracking-source').textContent=renderer.xr.isPresenting?`LIVE QUEST · L ${hands.left.size} / R ${hands.right.size} JOINTS`:'DESKTOP · SIMULATED HANDS';
  updatePanel();
}
function resize(){if(renderer.xr.isPresenting)return;const bounds=canvas.parentElement.getBoundingClientRect();renderer.setSize(bounds.width,bounds.height,false);camera.aspect=bounds.width/bounds.height;camera.updateProjectionMatrix();}
new ResizeObserver(resize).observe(canvas.parentElement);resize();
$('restart-journey').addEventListener('click',()=>{unlockAudio();begin();});
$('next-phase').addEventListener('click',()=>{unlockAudio();journey.next();});
$('preview-touch').addEventListener('click',()=>{unlockAudio();if(!journey.running&&!journey.finished)begin();activateOrb(touchCount%3);});
$('preview-form').addEventListener('click',()=>{unlockAudio();journey.elapsed=95;journey.running=true;activePhase=2;formIndex=(formIndex+1)%3;});
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
$('music-volume').addEventListener('input',event=>{audio.volume=Number(event.target.value)/100;audio.applyVolume();});
$('mute-music').addEventListener('click',()=>{audio.muted=!audio.muted;audio.applyVolume();$('mute-music').textContent=audio.muted?'Sound off':'Sound on';$('mute-music').setAttribute('aria-pressed',String(audio.muted));if(!audio.muted)unlockAudio();});
renderer.xr.addEventListener('sessionend',()=>{
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
    await renderer.xr.setSession(session);anchored=false;lastTime=0;begin();panel.visible=true;$('garden-rehearsal').hidden=true;$('garden-status').textContent='Journey running in Quest. Touch the floating lights with either hand.';
  }catch(error){$('enter-garden').disabled=false;$('garden-status').textContent=`Could not enter VR: ${error.message}. Check Quest hand tracking, then try again.`;}
});
checkVR();
renderer.setAnimationLoop((time,frame)=>{
  const seconds=time/1000,delta=lastTime?Math.max(0,seconds-lastTime):0;lastTime=seconds;
  const session=renderer.xr.getSession(),live=renderer.xr.isPresenting;
  const visible=!document.hidden&&(!live||session?.visibilityState==='visible');
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
  burst=Math.max(0,burst-delta*.6);world.update(seconds,burst);
  if(time-lastUI>150){updateUI();lastUI=time;}
  renderer.render(scene,camera);
});
window.addEventListener('pagehide',()=>{if(audio.timer)clearInterval(audio.timer);audio.context?.close();},{once:true});
