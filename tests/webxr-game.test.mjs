import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Quaternion} from '../webxr/vendor/three/three.module.min.js';
import {FoundryGame,graspInput,CORES,REST_Y,DOCK_Z,CORE_Z} from '../webxr/game.js';
import {CHAINS} from '../webxr/logic.js';

function input(index=0,closed=false) {
  const palm=new Vector3(CORES[index].x,REST_Y+.04,CORE_Z);
  return {valid:true,palm,quaternion:new Quaternion(),curls:Array(5).fill(closed?.5:0),
    pinchDistance:.07,pinchPoint:palm.clone()};
}
function advance(game,hand,count=6){for(let i=0;i<count;i++)game.step(.02,hand);}
function grab(game,index=0,pinch=false) {
  const hand=input(index);advance(game,hand,2);hand.curls.fill(.5);
  if(pinch){hand.curls.fill(0);hand.pinchDistance=.018;}
  advance(game,hand);assert.equal(game.held.id,CORES[index].id);return hand;
}
function deliver(game,hand,index=0,height=.15,dock=index) {
  hand.palm.y+=height;advance(game,hand);hand.palm.z=DOCK_Z;hand.palm.x=CORES[dock].x;advance(game,hand);
  hand.curls.fill(0);hand.pinchDistance=.07;advance(game,hand);
  advance(game,hand,45);
}

test('power grasp requires an open hand, proximity and stable closure',()=>{
  const game=new FoundryGame(),hand=input(0,true);advance(game,hand);assert.equal(game.held,null);
  hand.curls.fill(0);advance(game,hand);hand.palm.x=2;hand.curls.fill(.5);advance(game,hand);assert.equal(game.held,null);
  hand.palm.x=CORES[0].x;game.step(.02,hand);assert.equal(game.held,null);advance(game,hand);
  assert.equal(game.held.id,'mint');assert.equal(game.phase,'playing');
});
test('pinch grasp works without a fist and release uses hysteresis',()=>{
  const game=new FoundryGame(),hand=grab(game,1,true);assert.equal(game.gripMode,'pinch');
  hand.pinchDistance=.032;advance(game,hand);assert.ok(game.held);
  hand.pinchDistance=.05;game.step(.02,hand);assert.ok(game.held);assert.deepEqual(game.resistance,[0,0,0,0,0]);
  advance(game,hand);assert.equal(game.held,null);
});
test('held core follows hand translation and rotation without changing the input hand',()=>{
  const game=new FoundryGame(),hand=grab(game),offset=game.offset.clone();
  hand.palm.set(.15,.2,-.15);hand.quaternion.setFromAxisAngle(new Vector3(0,1,0),Math.PI/2);
  const expected=offset.applyQuaternion(hand.quaternion).add(hand.palm);advance(game,hand,1);
  assert.ok(game.held.position.distanceTo(expected)<.012,'fast motion follows within 12 mm on its first 20 ms frame');
  advance(game,hand,4);assert.ok(game.held.position.distanceTo(expected)<.0002);
  assert.deepEqual(hand.curls,Array(5).fill(.5));assert.deepEqual(game.referenceCurl,Array(5).fill(50));
});

test('pinch attachment follows the fingertip midpoint, independently of palm movement',()=>{
  const game=new FoundryGame(),hand=input();advance(game,hand,2);
  hand.pinchPoint.copy(game.objects[0].position);hand.pinchDistance=.018;
  advance(game,hand);assert.equal(game.gripMode,'pinch');
  const before=game.held.position.clone();
  hand.palm.add(new Vector3(.18,.05,.06));hand.quaternion.setFromAxisAngle(new Vector3(0,0,1),Math.PI/2);
  advance(game,hand,8);
  assert.ok(game.held.position.distanceTo(before)<1e-9,'moving/rotating the wrist cannot orbit a pinched core around the palm');
  hand.pinchPoint.add(new Vector3(0,.1,0));advance(game,hand,5);
  assert.ok(game.held.position.distanceTo(hand.pinchPoint)<.0002);
});

test('open-hand arming and candidate dwell reject a one-frame gesture or nearby-core change',()=>{
  const game=new FoundryGame(),hand=input();game.step(1/90,hand);
  hand.curls.fill(.5);advance(game,hand);assert.equal(game.held,null);
  hand.curls.fill(0);advance(game,hand,2);assert.equal(game.hovered.id,'mint');
  hand.curls.fill(.5);game.step(.02,hand);assert.ok(game.grabProgress>0 && game.grabProgress<1);
  hand.palm.x=CORES[1].x;game.step(.02,hand);assert.equal(game.held,null);
  assert.equal(game.hovered.id,'amber');advance(game,hand,2);assert.equal(game.held.id,'amber');
});

test('a relaxed grip remains held; clear opening immediately zeros requests before visual release',()=>{
  const game=new FoundryGame(),hand=grab(game);hand.curls.fill(.14);advance(game,hand,20);
  assert.ok(game.held);assert.ok(game.resistance.every(value=>value>0));
  hand.curls.fill(0);game.step(.01,hand);
  assert.ok(game.held);assert.deepEqual(game.intent('webxr').resistance,[0,0,0,0,0]);
  assert.ok(game.releaseProgress>0 && game.releaseProgress<1);
  // One noisy opening does not drop the core, and cannot keep a stale request.
  hand.curls.fill(.5);game.step(.01,hand);assert.ok(game.held);assert.equal(game.releaseProgress,0);
  hand.curls.fill(0);advance(game,hand,3);assert.equal(game.held,null);
});

test('small position and curl jitter are reduced without moving the tracked hand',()=>{
  const game=new FoundryGame(),hand=grab(game),dt=1/90;
  const origin=hand.palm.clone(),target=game.held.position.clone();let largestMotion=0;
  const requests=[];
  for(let frame=0;frame<90;frame++) {
    hand.palm.x=origin.x+(frame%2?.001:-.001);hand.curls.fill(frame%2?.55:.45);
    const originalPalm=hand.palm.clone();game.step(dt,hand);
    assert.ok(hand.palm.equals(originalPalm));assert.ok(game.held);
    if(frame>20){largestMotion=Math.max(largestMotion,Math.abs(game.held.position.x-target.x));requests.push(game.resistance[0]);}
  }
  assert.ok(largestMotion<.0007,'a 1 mm alternating tracking jitter is reduced');
  assert.ok(Math.max(...requests)-Math.min(...requests)<=1,'active resistance does not chatter with small curl noise');
});

test('grab, release, active requests and delivery remain consistent across headset frame rates',()=>{
  const results=[];
  for(const fps of [20,30,72,90,120]) {
    const dt=1/fps,game=new FoundryGame(),hand=input();
    for(let t=0;t<.08;t+=dt)game.step(dt,hand);
    hand.curls.fill(.5);let graspDuration=0;
    while(!game.held && graspDuration<.2){game.step(dt,hand);graspDuration+=dt;}
    assert.ok(game.held);assert.ok(graspDuration>=.055 && graspDuration<.055+dt+.0001);
    const start=hand.palm.clone();
    for(let t=dt;t<=.3+dt/2;t+=dt){hand.palm.y=start.y+.18*Math.min(1,t/.3);game.step(dt,hand);}
    for(let t=0;t<.12;t+=dt)game.step(dt,hand);
    assert.ok(game.held.lifted);assert.equal(game.liftProgress,1);
    hand.palm.z=DOCK_Z;for(let t=0;t<.18;t+=dt)game.step(dt,hand);
    assert.equal(game.dockAligned,true);
    const request=game.resistance[0];hand.curls.fill(0);let releaseDuration=0;
    while(game.held && releaseDuration<.2){game.step(dt,hand);releaseDuration+=dt;assert.deepEqual(game.resistance,[0,0,0,0,0]);}
    assert.equal(game.held,null);assert.ok(releaseDuration>=.06 && releaseDuration<.06+dt+.0001);
    for(let t=0;t<1;t+=dt)game.step(dt,hand);
    assert.equal(game.score,80);results.push(request);
  }
  assert.ok(Math.max(...results)-Math.min(...results)<=1);
});

test('paused tracking waits for a stable open hand before restarting the timer',()=>{
  const game=new FoundryGame(),hand=grab(game);game.step(.02,{valid:false});const remaining=game.remaining;
  advance(game,hand,30);assert.equal(game.remaining,remaining);
  hand.curls.fill(0);advance(game,hand,3);assert.equal(game.paused,false);
  game.step(.02,hand);assert.ok(game.remaining<remaining);
});

test('nonfinite pose, quaternion or curl samples immediately release and clear requests',()=>{
  for(const corrupt of [hand=>hand.palm.x=NaN,hand=>hand.quaternion.w=Infinity,hand=>hand.curls[2]=NaN,hand=>hand.pinchDistance=NaN]) {
    const game=new FoundryGame(),hand=grab(game);corrupt(hand);game.step(.02,hand);
    assert.equal(game.held,null);assert.equal(game.hovered,null);assert.equal(game.grabProgress,0);
    assert.deepEqual(game.resistance,[0,0,0,0,0]);assert.deepEqual(game.referenceCurl,[0,0,0,0,0]);
  }
});
test('only a lifted core landed in its matching dock scores, once per delivery',()=>{
  const game=new FoundryGame();let hand=grab(game);deliver(game,hand,0,.15,1);assert.equal(game.score,0);
  game.reset();hand=grab(game);deliver(game,hand,0,.04);assert.equal(game.score,0);
  game.reset();hand=grab(game);deliver(game,hand);assert.equal(game.score,80);assert.equal(game.deliveries,1);
  advance(game,hand,90);assert.equal(game.score,80);
  hand=grab(game,1);deliver(game,hand,1);assert.equal(game.score,80+Math.round(130*1.25));
});
test('heavy cores request more per-finger resistance; preview never transmits it',()=>{
  const levels=[];
  for(let i=0;i<3;i++) {
    const game=new FoundryGame(),hand=grab(game,i);hand.palm.y+=.5;advance(game,hand);
    levels.push(game.resistance[1]);assert.ok(game.resistance.every(value=>value>0 && value<=80));
    assert.ok(game.intent('webxr').resistance.every(value=>value>0));
    assert.deepEqual(game.intent('desktop-preview').resistance,[0,0,0,0,0]);
    assert.deepEqual(game.intent('webxr',false).resistance,[0,0,0,0,0]);
  }
  assert.ok(levels[0]<levels[1] && levels[1]<levels[2]);
});
test('tracking loss releases, zeros, pauses time and requires opening before regrab',()=>{
  const game=new FoundryGame(),hand=grab(game,2);hand.palm.y+=.18;advance(game,hand);
  const time=game.remaining;game.step(.02,{valid:false});assert.equal(game.held,null);
  assert.equal(game.remaining,time);assert.deepEqual(game.intent('webxr').resistance,[0,0,0,0,0]);
  advance(game,hand);assert.equal(game.held,null);
  hand.curls.fill(0);advance(game,hand);
  hand.palm.copy(game.objects[2].position).add(new Vector3(0,.04,0));
  hand.curls.fill(.5);advance(game,hand);assert.ok(game.held);
});
test('long frame gaps and round end stop resistance; throw speed is bounded',()=>{
  const game=new FoundryGame();let hand=grab(game);game.step(10,hand);
  assert.equal(game.held,null);assert.deepEqual(game.resistance,[0,0,0,0,0]);
  game.reset();hand=grab(game);game.remaining=.01;game.step(.02,hand);
  assert.equal(game.phase,'over');assert.equal(game.held,null);assert.deepEqual(game.resistance,[0,0,0,0,0]);
  advance(game,hand);assert.equal(game.held,null);
  game.reset();hand=grab(game);hand.curls.fill(0);
  for(let i=0;i<5;i++){hand.palm.x+=.1;game.step(.02,hand);}
  assert.ok(game.objects[0].velocity.length()<1.4);
});
test('grasp input uses a complete actual hand and rejects missing or degenerate joints',()=>{
  const poses=new Map([['wrist',{x:0,y:0,z:0,orientation:new Quaternion()}]]);
  CHAINS.forEach((chain,i)=>chain.slice(1).forEach((name,j)=>poses.set(name,{x:i*.02,y:0,z:-.02*(j+1)})));
  assert.equal(graspInput(poses).valid,true);
  poses.delete('pinky-finger-tip');assert.equal(graspInput(poses).valid,false);
  poses.set('pinky-finger-tip',poses.get('pinky-finger-phalanx-distal'));assert.equal(graspInput(poses).valid,false);
  poses.delete('wrist');assert.equal(graspInput(poses).valid,false);
});
