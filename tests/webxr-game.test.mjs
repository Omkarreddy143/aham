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
  assert.ok(game.held.position.distanceTo(expected)<1e-9);
  assert.deepEqual(hand.curls,Array(5).fill(.5));assert.deepEqual(game.referenceCurl,Array(5).fill(50));
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
