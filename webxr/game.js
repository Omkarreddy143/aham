import {Vector3, Quaternion} from './vendor/three/three.module.min.js';
import {fingerStates} from './logic.js';

// Virtual masses and dimensionless requests are game parameters, not force limits.
export const CORES = [
  {id:'mint', name:'Ion', mass:0.25, load:0.18, points:80, color:0x68e8ce, duty:95, pattern:1, x:-0.24},
  {id:'amber', name:'Flux', mass:1, load:0.42, points:130, color:0xffbc6d, duty:130, pattern:2, x:0},
  {id:'violet', name:'Nova', mass:3, load:0.68, points:200, color:0xb9a0ff, duty:155, pattern:3, x:0.24},
];
export const REST_Y=-0.048, CORE_Z=0.075, DOCK_Z=-0.205, RADIUS=0.043;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const point=pose=>new Vector3(pose.x,pose.y,pose.z);
const ZERO=()=>[0,0,0,0,0];
const OPEN_DWELL=0.035, GRAB_DWELL=0.055, RELEASE_DWELL=0.06;
const finitePoint=p=>p && ['x','y','z'].every(axis=>Number.isFinite(p[axis]));
const validInput=input=>input?.valid && finitePoint(input.palm) && finitePoint(input.pinchPoint) &&
  ['x','y','z','w'].every(axis=>Number.isFinite(input.quaternion?.[axis])) &&
  Math.abs(['x','y','z','w'].reduce((sum,axis)=>sum+input.quaternion[axis]**2,0)-1)<0.1 &&
  Array.isArray(input.curls) && input.curls.length===5 && input.curls.every(value=>Number.isFinite(value) && value>=0 && value<=1) &&
  Number.isFinite(input.pinchDistance) && input.pinchDistance>=0;

export function graspInput(poses) {
  const {valid,curls}=fingerStates(poses);
  if(!valid.every(Boolean) || curls.some(value=>value===null)) return {valid:false};
  const wrist=poses.get('wrist');
  const orientation=wrist.orientation;
  if(!orientation || !['x','y','z','w'].every(axis=>Number.isFinite(orientation[axis]))) return {valid:false};
  const quaternion=new Quaternion(orientation.x,orientation.y,orientation.z,orientation.w);
  if(quaternion.lengthSq()<0.5) return {valid:false};
  quaternion.normalize();
  const palm=point(wrist);
  for(const finger of ['index','middle','ring','pinky']) palm.add(point(poses.get(finger+'-finger-phalanx-proximal')));
  palm.multiplyScalar(1/5);
  const thumb=point(poses.get('thumb-tip')), index=point(poses.get('index-finger-tip'));
  return {valid:true,palm,quaternion,curls,pinchDistance:thumb.distanceTo(index),
    pinchPoint:thumb.add(index).multiplyScalar(0.5)};
}

export class FoundryGame {
  constructor(){this.best=0;this.reset();}
  reset() {
    this.objects=CORES.map(spec=>({...spec,position:new Vector3(spec.x,REST_Y,CORE_Z),
      quaternion:new Quaternion(),velocity:new Vector3(),state:'ready',cooldown:0,lifted:false}));
    this.held=null;this.phase='ready';this.remaining=75;this.score=0;this.deliveries=0;this.combo=0;
    this.message='Right hand: close around a core, lift, then open over its matching dock.';
    this.canGrab=false;this.grabTime=0;this.grabCandidate=null;this.releaseTime=0;this.paused=false;this.resistance=ZERO();this.referenceCurl=ZERO();
    this.events=[];this.lastAnchor=null;this.handVelocity=new Vector3();this.releaseVelocity=new Vector3();this.openTime=0;
    this.filteredResistance=ZERO();this.hovered=null;this.grabProgress=0;this.releaseProgress=0;this.liftProgress=0;this.dockAligned=false;
  }
  suspend(message='Tracking paused. Open your right hand to continue.') {
    if(this.held){this.held.state='falling';this.held.velocity.set(0,0,0);this.held.lifted=false;this.held=null;}
    this.canGrab=false;this.grabTime=0;this.grabCandidate=null;this.releaseTime=0;this.lastAnchor=null;this.openTime=0;this.paused=true;
    this.handVelocity.set(0,0,0);this.releaseVelocity.set(0,0,0);this.filteredResistance=ZERO();
    this.hovered=null;this.grabProgress=0;this.releaseProgress=0;this.liftProgress=0;this.dockAligned=false;
    this.resistance=ZERO();this.referenceCurl=ZERO();this.message=this.phase==='over'?'Shift complete! Touch NEW SHIFT for another round.':message;
  }
  step(delta, input) {
    this.events=[];this.resistance=ZERO();this.hovered=null;this.grabProgress=0;this.releaseProgress=0;this.dockAligned=false;
    // Never convert a long frame gap into a throw or continued resistance.
    if(!Number.isFinite(delta) || delta<0 || delta>0.15){this.suspend();return;}
    const dt=delta;
    if(!validInput(input)){this.suspend();return;}
    if(this.phase==='playing' && !this.paused) {
      this.remaining=Math.max(0,this.remaining-delta);
      if(this.remaining===0){this.best=Math.max(this.best,this.score);this.suspend('Shift complete! Touch NEW SHIFT for another round.');this.phase='over';}
    }
    const pinch=input.pinchDistance;
    const folded=input.curls.slice(1).filter(value=>value>0.25).length;
    const relaxed=input.curls.slice(1).filter(value=>value>0.15).length;
    const closing=pinch<0.026 || folded>=3;
    const open=pinch>0.045 && relaxed<2;
    this.openTime=open?this.openTime+dt:0;
    if(this.openTime>=OPEN_DWELL){
      this.canGrab=true;this.grabTime=0;this.grabCandidate=null;
      if(this.paused && this.phase!=='over')this.message='Tracking ready. Grab a core, lift, then deliver to its matching dock.';
      this.paused=false;
    }
    const mode=this.held?this.gripMode:pinch<0.026?'pinch':'grip';
    const anchor=mode==='pinch'?input.pinchPoint:input.palm;
    const previousVelocity=this.handVelocity.clone();
    if(this.lastAnchor && this.lastAnchorMode===mode && dt>0) {
      const velocity=point(anchor).sub(this.lastAnchor).divideScalar(dt).clampLength(0,1.2);
      this.handVelocity.lerp(velocity,1-Math.exp(-dt/0.025));
    } else this.handVelocity.set(0,0,0);
    this.lastAnchor=point(anchor);this.lastAnchorMode=mode;
    if(this.held) {
      const object=this.held;
      // A slightly relaxed fist stays held. Clearly opening ends its request on
      // this frame, even while the visual release waits out a single noisy pose.
      const releasing=this.gripMode==='pinch'?pinch>0.045:input.curls.slice(1).filter(value=>value>0.12).length<2;
      if(releasing && this.releaseTime===0)this.releaseVelocity.copy(previousVelocity);
      this.releaseTime=releasing?this.releaseTime+dt:0;
      this.releaseProgress=clamp(this.releaseTime/RELEASE_DWELL,0,1);
      const target=this.offset.clone().applyQuaternion(input.quaternion).add(anchor);
      // Suppress millimetre jitter with a small time-based filter. Quick motion
      // uses a shorter time constant; the actual tracked hand is never altered.
      const speed=dt>0?object.position.distanceTo(target)/dt:0;
      const followTime=0.005+0.010/(1+(speed/0.25)**2);
      const alpha=dt>0?1-Math.exp(-dt/followTime):0;
      object.position.lerp(target,alpha);
      object.quaternion.slerp(input.quaternion.clone().multiply(this.rotationOffset),alpha);
      object.lifted ||= object.position.y-REST_Y>0.075;
      this.liftProgress=clamp((object.position.y-REST_Y)/0.075,0,1);
      this.dockAligned=object.lifted && Math.hypot(object.position.x-object.x,object.position.z-DOCK_Z)<0.078;
      if(releasing) {
        // Intent ends immediately; only the visual release is debounced.
        this.resistance=ZERO();this.filteredResistance=ZERO();
        if(this.releaseTime>=RELEASE_DWELL) {
          object.state='falling';object.velocity.copy(this.releaseVelocity);this.held=null;this.canGrab=false;
          this.openTime=0;this.liftProgress=0;this.dockAligned=false;
          this.referenceCurl=ZERO();this.events.push({type:'release'});
          this.message='Core released. Match its color to the dock.';
        }
      } else {
        const lift=clamp((object.position.y-REST_Y)/0.25,0,1);
        const blend=dt>0?1-Math.exp(-dt/0.035):0;
        input.curls.forEach((value,i)=>{
          const request=clamp((object.load+0.08*lift)*(0.55+0.45*value),0,0.8)*100;
          this.filteredResistance[i]+=(request-this.filteredResistance[i])*blend;
        });
        this.resistance=this.filteredResistance.map(value=>Math.round(value));
        this.message=object.name+' held · '+object.mass+' kg virtual mass · lift and deliver';
      }
    } else if(this.phase!=='over' && !this.paused) {
      const candidates=this.objects.filter(object=>object.state==='ready' || object.state==='falling');
      const object=candidates.sort((a,b)=>a.position.distanceTo(anchor)-b.position.distanceTo(anchor))[0];
      const nearby=object && object.position.distanceTo(anchor)<RADIUS+(mode==='pinch'?0.022:0.045);
      this.hovered=nearby?object:null;
      const candidate=nearby && this.canGrab && closing?object.id+':'+mode:null;
      if(candidate!==this.grabCandidate)this.grabTime=0;
      this.grabCandidate=candidate;
      this.grabTime=candidate?this.grabTime+dt:0;
      this.grabProgress=clamp(this.grabTime/GRAB_DWELL,0,1);
      if(this.grabTime>=GRAB_DWELL) {
        this.held=object;object.state='held';object.velocity.set(0,0,0);object.lifted=false;
        this.gripMode=mode;this.canGrab=false;this.grabTime=0;this.releaseTime=0;this.openTime=0;
        this.hovered=null;this.filteredResistance=ZERO();
        this.referenceCurl=input.curls.map(value=>Math.round(value*100));
        const inverse=input.quaternion.clone().invert();
        this.offset=object.position.clone().sub(anchor).applyQuaternion(inverse);
        this.rotationOffset=inverse.multiply(object.quaternion);
        if(this.phase==='ready'){this.phase='playing';this.message='Shift started!';}
        this.events.push({type:'grab',object:object.id});
      }
    }
    for(const object of this.objects) {
      if(object.state==='delivered') {
        object.cooldown-=dt;
        if(object.cooldown<=0){object.position.set(object.x,REST_Y,CORE_Z);object.quaternion.identity();object.state='ready';object.lifted=false;}
      } else if(object.state==='falling') {
        // Exact constant acceleration and horizontal drag keep landings stable
        // at 30, 72, 90 or 120 Hz, rather than clipping slower frame durations.
        const drag=Math.exp(-3*dt), travel=(1-drag)/3;
        object.position.x+=object.velocity.x*travel;object.position.z+=object.velocity.z*travel;
        object.position.y+=object.velocity.y*dt-1.6*dt*dt;object.velocity.y-=3.2*dt;
        object.velocity.x*=drag;object.velocity.z*=drag;
        const dock=CORES.find(spec=>Math.hypot(object.position.x-spec.x,object.position.z-DOCK_Z)<0.078);
        const ground=dock?REST_Y+0.008:REST_Y;
        if(object.position.y<=ground) {
          object.position.y=ground;object.velocity.set(0,0,0);
          if(this.phase==='playing' && dock?.id===object.id && object.lifted) {
            this.combo++;const multiplier=1+Math.min(4,this.combo-1)*0.25;
            const earned=Math.round(object.points*multiplier);this.score+=earned;this.deliveries++;
            this.best=Math.max(this.best,this.score);object.state='delivered';object.cooldown=0.9;
            this.message='+'+earned+' · '+this.combo+' deliveries in a row!';this.events.push({type:'delivery',object:object.id,earned});
          } else {
            object.state='ready';this.combo=0;
            this.message=this.phase==='over'?'Shift complete! Touch NEW SHIFT for another round.':
              dock?'Lift at least 8 cm; use the matching color dock.':'Missed dock. Grab the core and try again.';
            // Keep misplaced objects reachable, including throws outside the bench.
            if(Math.abs(object.position.x)>0.4 || object.position.z>0.27 || object.position.z<-.31) object.position.set(object.x,REST_Y,CORE_Z);
          }
        }
      }
    }
  }
  intent(source, enabled=true) {
    const live=source==='webxr' && enabled && !!this.held && this.phase==='playing';
    const holding=live && this.resistance.some(Boolean);
    return {version:1,source,hand:'right',trackingValid:!!enabled,holding,
      objectId:holding?this.held.id:null,gripMode:holding?this.gripMode:'none',
      resistance:holding?[...this.resistance]:ZERO(),referenceCurl:holding?[...this.referenceCurl]:ZERO()};
  }
}
