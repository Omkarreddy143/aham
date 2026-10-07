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
    this.events=[];this.lastPalm=null;
  }
  suspend(message='Tracking paused. Open your right hand to continue.') {
    if(this.held){this.held.state='falling';this.held.velocity.set(0,0,0);this.held.lifted=false;this.held=null;}
    this.canGrab=false;this.grabTime=0;this.grabCandidate=null;this.releaseTime=0;this.lastPalm=null;this.paused=true;
    this.resistance=ZERO();this.referenceCurl=ZERO();this.message=this.phase==='over'?'Shift complete! Touch NEW SHIFT for another round.':message;
  }
  step(delta, input) {
    // Never convert a long frame gap into a throw or continued resistance.
    if(!Number.isFinite(delta) || delta<0 || delta>0.15){this.suspend();return;}
    const dt=Math.min(delta,0.04);
    this.events=[];this.resistance=ZERO();
    if(!input?.valid){this.suspend();return;}
    if(this.phase==='playing') {
      this.remaining=Math.max(0,this.remaining-delta);
      if(this.remaining===0){this.best=Math.max(this.best,this.score);this.suspend('Shift complete! Touch NEW SHIFT for another round.');this.phase='over';}
    }
    const pinch=input.pinchDistance;
    const folded=input.curls.slice(1).filter(value=>value>0.25).length;
    const relaxed=input.curls.slice(1).filter(value=>value>0.15).length;
    const closing=pinch<0.026 || folded>=3;
    const open=pinch>0.045 && relaxed<2;
    if(open){
      this.canGrab=true;this.grabTime=0;this.grabCandidate=null;
      if(this.paused && this.phase!=='over')this.message='Tracking ready. Grab a core, lift, then deliver to its matching dock.';
      this.paused=false;
    }
    let velocity=new Vector3();
    if(this.lastPalm && dt>0.001) velocity.copy(input.palm).sub(this.lastPalm).divideScalar(dt).clampLength(0,1.2);
    this.lastPalm=input.palm.clone();
    if(this.held) {
      const object=this.held;
      const releasing=this.gripMode==='pinch'?pinch>0.045:relaxed<2;
      this.releaseTime=releasing?this.releaseTime+dt:0;
      object.position.copy(this.offset).applyQuaternion(input.quaternion).add(input.palm);
      object.quaternion.copy(input.quaternion).multiply(this.rotationOffset);
      object.lifted ||= object.position.y-REST_Y>0.075;
      if(releasing) {
        // Intent ends immediately; only the visual release is debounced.
        this.resistance=ZERO();
        if(this.releaseTime>=0.09) {
          object.state='falling';object.velocity.copy(velocity);this.held=null;this.canGrab=false;
          this.referenceCurl=ZERO();this.events.push({type:'release'});
          this.message='Core released. Match its color to the dock.';
        }
      } else {
        const lift=clamp((object.position.y-REST_Y)/0.25,0,1);
        this.resistance=input.curls.map(value=>Math.round(clamp((object.load+0.08*lift)*(0.55+0.45*value),0,0.8)*100));
        this.message=object.name+' held · '+object.mass+' kg virtual mass · lift and deliver';
      }
    } else if(this.phase!=='over' && this.canGrab && closing) {
      const candidates=this.objects.filter(object=>object.state==='ready' || object.state==='falling');
      const anchor=pinch<0.026?input.pinchPoint:input.palm;
      const object=candidates.sort((a,b)=>a.position.distanceTo(anchor)-b.position.distanceTo(anchor))[0];
      const nearby=object && object.position.distanceTo(anchor)<RADIUS+0.065;
      if(object?.id!==this.grabCandidate)this.grabTime=0;
      this.grabCandidate=nearby?object.id:null;
      this.grabTime=nearby?this.grabTime+dt:0;
      if(this.grabTime>=0.06) {
        this.held=object;object.state='held';object.velocity.set(0,0,0);object.lifted=false;
        this.gripMode=pinch<0.026?'pinch':'grip';this.canGrab=false;this.grabTime=0;this.releaseTime=0;
        this.referenceCurl=input.curls.map(value=>Math.round(value*100));
        const inverse=input.quaternion.clone().invert();
        this.offset=object.position.clone().sub(input.palm).applyQuaternion(inverse);
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
        object.velocity.y-=3.2*dt;object.position.addScaledVector(object.velocity,dt);
        object.velocity.x*=Math.exp(-3*dt);object.velocity.z*=Math.exp(-3*dt);
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
