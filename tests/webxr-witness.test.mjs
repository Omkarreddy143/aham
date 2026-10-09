import test from 'node:test';
import assert from 'node:assert/strict';
import {Journey,phaseAt,touchesLight} from '../webxr/witness-logic.js';
test('guided chapters cover precisely two minutes and finish without replay',()=>{
  const journey=new Journey();journey.start();
  assert.deepEqual([0,34.9,35,64.9,65,99.9,100,120].map(phaseAt),[0,0,1,1,2,2,3,3]);
  for(let i=0;i<480;i++)journey.advance(.25);
  assert.equal(journey.elapsed,120);assert.equal(journey.finished,true);assert.equal(journey.running,false);
  journey.advance(.25);assert.equal(journey.elapsed,120);
  journey.start();assert.equal(journey.elapsed,0);
});
test('background pauses and invalid times do not consume the demo',()=>{
  const journey=new Journey();journey.start();
  journey.advance(120,false);journey.advance(NaN);journey.advance(-1);
  assert.equal(journey.elapsed,0);
  journey.advance(120);assert.equal(journey.elapsed,.25);
  journey.next();assert.equal(journey.elapsed,35);
  journey.next();journey.next();journey.next();assert.equal(journey.finished,true);assert.equal(journey.running,false);
});
test('only finite tracked fingertips create contact; missing hands never do',()=>{
  const center={x:0,y:0,z:0};
  assert.equal(touchesLight(new Map(),center,.04),false);
  assert.equal(touchesLight(new Map([['wrist',center]]),center,.04),false);
  assert.equal(touchesLight(new Map([['index-finger-tip',{x:0,y:0,z:.045,radius:.008}]]),center,.04),true);
  assert.equal(touchesLight(new Map([['index-finger-tip',{x:0,y:0,z:NaN}]]),center,.04),false);
  assert.equal(touchesLight(new Map([['index-finger-tip',{x:0,y:0,z:.08}]]),center,.04),false);
});
