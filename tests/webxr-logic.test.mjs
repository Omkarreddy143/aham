import test from 'node:test';
import assert from 'node:assert/strict';
import {CHAINS,JOINTS,curl,sphereTouchesBox,fingerStates,handCue,cueRequest} from '../webxr/logic.js';
import {readHandPoses} from '../webxr/tracking.js';

test('curl uses bone angles, including degenerate and missing joints',()=>{
  assert.equal(curl([{x:0,y:0,z:0},{x:0,y:0,z:-1},{x:0,y:0,z:-2}]),0);
  assert.equal(curl([{x:0,y:0,z:0},{x:0,y:0,z:-1},{x:0,y:-1,z:-1}]),1);
  assert.equal(curl([{x:0,y:0,z:0},{x:0,y:0,z:0},{x:0,y:0,z:-1}]),null);
  assert.equal(curl([null,null,null]),null);
});
test('tip collision respects sphere radius and clears on tracking loss',()=>{
  const box={min:{x:-1,y:-1,z:-1},max:{x:1,y:1,z:1}};
  assert.equal(sphereTouchesBox({x:1.005,y:0,z:0},0.01,box),true);
  assert.equal(sphereTouchesBox({x:1.02,y:0,z:0},0.01,box),false);
  const poses=new Map([['index-finger-tip',{x:0,y:0,z:0,radius:.008}]]);
  const targets=[{box,duty:100,pattern:1,name:'Smooth'}];
  assert.deepEqual(handCue(poses,targets,[true,true,true,true,true]),{duties:[0,100,0,0,0],patterns:[0,1,0,0,0],contacts:[null,'Smooth',null,null,null]});
  assert.deepEqual(handCue(poses,targets,[false,false,false,false,false]),{duties:[0,0,0,0,0],patterns:[0,0,0,0,0],contacts:[null,null,null,null,null]});
  assert.deepEqual(handCue(new Map(),targets,[true,true,true,true,true]).duties,[0,0,0,0,0]);
});

test('every fingertip gets its own material cue; loss clears only that channel',()=>{
  const poses=new Map(CHAINS.map((chain,i)=>[chain.at(-1),{x:i,y:0,z:0,radius:.01}]));
  const targets=Array.from({length:5},(_,i)=>({box:{min:{x:i-.1,y:-.1,z:-.1},max:{x:i+.1,y:.1,z:.1}},duty:80+i*10,pattern:i%3+1,name:'Target '+i}));
  const cue=handCue(poses,targets,[true,true,true,true,true]);
  assert.deepEqual(cue.duties,[80,90,100,110,120]);
  assert.deepEqual(cue.patterns,[1,2,3,1,2]);
  assert.deepEqual(cue.contacts,['Target 0','Target 1','Target 2','Target 3','Target 4']);
  assert.deepEqual(handCue(poses,targets,[true,true,false,true,true]).duties,[80,90,0,110,120]);
  poses.delete('thumb-tip');
  assert.deepEqual(handCue(poses,targets,[true,true,true,true,true]).duties,[0,90,100,110,120]);
});

test('reads all 25 joints of both hands and follows wrist movement',()=>{
  const sources=['left','right'].map(handedness=>({handedness,hand:new Map(JOINTS.map(name=>[name,{name,handedness}]))}));
  let offset=0, missing=null;
  const frame={getJointPose(space){
    if(space.handedness==='right' && space.name===missing)return null;
    const i=JOINTS.indexOf(space.name);
    return {transform:{position:{x:offset+(space.handedness==='right'?.2:-.2)+i*.001,y:i*.002,z:-.3+i*.003},orientation:{x:0,y:0,z:0,w:1}},radius:.008,emulatedPosition:false};
  }};
  let hands=readHandPoses(frame,{},sources);
  assert.equal(JOINTS.length,25);
  assert.equal(hands.right.size,25);assert.equal(hands.left.size,25);
  assert.deepEqual(fingerStates(hands.right).valid,[true,true,true,true,true]);
  assert.equal(fingerStates(hands.left).curls.length,5);
  const wristX=hands.right.get('wrist').x, littleX=hands.right.get('pinky-finger-tip').x;
  offset=.1;missing='middle-finger-tip';hands=readHandPoses(frame,{},sources);
  assert.equal(hands.right.size,24);assert.equal(hands.left.size,25);
  assert.deepEqual(fingerStates(hands.right).valid,[true,true,false,true,true]);
  assert.ok(Math.abs(hands.right.get('wrist').x-wristX-.1)<1e-9);
  assert.ok(Math.abs(hands.right.get('pinky-finger-tip').x-littleX-.1)<1e-9);
  hands.right.delete('wrist');
  assert.deepEqual(fingerStates(hands.right).valid,[false,false,false,false,false]);
  const lost=readHandPoses(frame,{},[]);
  assert.equal(lost.right.size,0);assert.equal(lost.left.size,0);
});
test('only real tracked WebXR contact can send a nonzero monitor cue',()=>{
  const cue={duties:[0,150,0,0,0],patterns:[0,2,0,0,0]};
  assert.deepEqual(cueRequest(cue,'webxr','right',true).duties,cue.duties);
  assert.deepEqual(cueRequest(cue,'webxr','right',false).duties,[0,0,0,0,0]);
  assert.deepEqual(cueRequest(cue,'desktop-preview','right',true).duties,[0,0,0,0,0]);
});
