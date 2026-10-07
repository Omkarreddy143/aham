import test from 'node:test';
import assert from 'node:assert/strict';
import {curl,sphereTouchesBox,indexCue,cueRequest} from '../webxr/logic.js';

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
  assert.deepEqual(indexCue(poses,targets,true),{duties:[0,100,0,0,0],patterns:[0,1,0,0,0],contact:'Smooth'});
  assert.deepEqual(indexCue(poses,targets,false),{duties:[0,0,0,0,0],patterns:[0,0,0,0,0],contact:null});
  assert.equal(indexCue(new Map(),targets,true).contact,null);
});
test('only real tracked WebXR contact can send a nonzero monitor cue',()=>{
  const cue={duties:[0,150,0,0,0],patterns:[0,2,0,0,0]};
  assert.deepEqual(cueRequest(cue,'webxr','right',true).duties,cue.duties);
  assert.deepEqual(cueRequest(cue,'webxr','right',false).duties,[0,0,0,0,0]);
  assert.deepEqual(cueRequest(cue,'desktop-preview','right',true).duties,[0,0,0,0,0]);
});
