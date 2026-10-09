import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../webxr/vendor/three/three.module.min.js';
import {TrackedHand} from '../webxr/realistic-hand.js';
import {JOINTS} from '../webxr/logic.js';

for(const side of ['left','right'])test(`${side} articulated mesh follows open/closed joint poses and hides on tracking loss`,async()=>{
  const bytes=await readFile(new URL(`../webxr/assets/hands/${side}.glb`,import.meta.url));
  const hand=new TrackedHand(new THREE.Scene(),side,{buffer:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
  assert.equal(await hand.ready,true,hand.loadError);
  assert.equal(hand.bones.size,25);assert.ok(hand.mesh.isSkinnedMesh);
  const open=hand.preview(0,{curl:0}),closed=hand.preview(0,{curl:.95});
  assert.equal(open.size,25);assert.equal(closed.size,25);
  const inward=side==='left'?1:-1;
  assert.ok((open.get('thumb-tip').x-open.get('wrist').x)*inward>0,'Preview thumbs face inward');
  assert.ok((open.get('pinky-finger-tip').x-open.get('wrist').x)*inward<0,'Preview little fingers face outward');
  hand.update(open);assert.equal(hand.model.visible,true);assert.equal(hand.fallback.visible,false);
  const tipOpen=hand.bones.get('index-finger-tip').position.clone();
  hand.update(closed);assert.ok(tipOpen.distanceTo(hand.bones.get('index-finger-tip').position)>.02);
  hand.mesh.skeleton.update();
  for(let i=0;i<hand.mesh.geometry.attributes.position.count;i+=47){
    const point=new THREE.Vector3().fromBufferAttribute(hand.mesh.geometry.attributes.position,i);
    hand.mesh.applyBoneTransform(i,point);assert.ok([point.x,point.y,point.z].every(Number.isFinite));
  }
  const translated=new Map([...closed].map(([name,p])=>[name,{...p,x:p.x+.3,y:p.y+.2}]));
  hand.update(translated);assert.ok(Math.abs(hand.bones.get('wrist').position.x-translated.get('wrist').x)<1e-6);
  const incomplete=new Map(translated);incomplete.delete('index-finger-tip');hand.update(incomplete);assert.equal(hand.model.visible,false);
  hand.update(new Map());assert.equal(hand.group.visible,false);
  for(const name of JOINTS)assert.ok(hand.bind.has(name));
});
