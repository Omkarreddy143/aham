import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {GardenInteractions,SEED_HOMES,BOWL} from '../webxr/witness-interactions.js';
import {captionAt,GardenAudio} from '../webxr/witness-audio.js';
import {CHAINS} from '../webxr/logic.js';

function hand(point,gap=.08){
  const poses=new Map([['wrist',{x:point.x,y:point.y-.10,z:point.z}]]);
  for(const [finger,chain] of CHAINS.entries())for(const [j,name] of chain.slice(1).entries())poses.set(name,{x:point.x+(finger-2)*.012,y:point.y-.08+j*.025,z:point.z});
  poses.set('thumb-tip',{...point,x:point.x-gap/2});poses.set('index-finger-tip',{...point,x:point.x+gap/2});return poses;
}
function step(state,left,right,phase=0,dt=.02){return state.update({left,right},dt,phase);}
test('pinch must begin with an observed open hand; one seed cannot have two owners',()=>{
  const state=new GardenInteractions(),p=SEED_HOMES[0];
  assert.deepEqual(step(state,hand(p,.01),new Map()),[]);
  step(state,hand(p),hand(p));
  const events=step(state,hand(p,.01),hand(p,.01));
  assert.equal(events.filter(e=>e.type==='grab').length,1);assert.equal(state.seeds[0].owner,'left');
});
test('carry and deliberate opening over the bowl plant; opening elsewhere does not',()=>{
  const state=new GardenInteractions(),p=SEED_HOMES[1],empty=new Map();
  step(state,hand(p),empty);step(state,hand(p,.01),empty);
  step(state,hand({...BOWL,y:BOWL.y+.12},.01),empty);
  assert.equal(step(state,hand({...BOWL,y:BOWL.y+.12}),empty)[0].type,'plant');assert.equal(state.flowers,1);
  for(let i=0;i<10;i++)step(state,hand(p),empty,0,.1);
  step(state,hand(p,.01),empty);
  assert.equal(step(state,hand({x:.5,y:0,z:0}),empty)[0].type,'release');assert.equal(state.flowers,1);
});
test('tracking loss cancels a carried seed without planting and requires open before retry',()=>{
  const state=new GardenInteractions(),p=SEED_HOMES[0],empty=new Map();
  step(state,hand(p),empty);step(state,hand(p,.01),empty);
  assert.equal(step(state,empty,empty)[0].type,'cancel');assert.equal(state.flowers,0);
  assert.deepEqual(state.seeds[0].position,p);assert.deepEqual(step(state,hand(p,.01),empty),[]);
  const invalid=hand(p);invalid.set('index-finger-tip',{x:NaN,y:0,z:0});assert.deepEqual(step(state,invalid,empty),[]);
});
test('pinch hysteresis tolerates jitter and phase transition never plants a seed',()=>{
  const state=new GardenInteractions(),p=SEED_HOMES[0],empty=new Map();
  step(state,hand(p),empty);step(state,hand(p,.02),empty);step(state,hand(p,.04),empty);
  assert.equal(state.seeds[0].owner,'left');
  assert.equal(step(state,hand(p,.04),empty,1)[0].type,'release');assert.equal(state.flowers,0);
});
function straight(x){const p=new Map([['wrist',{x,y:-.1,z:0}]]);CHAINS.forEach((chain,i)=>chain.slice(1).forEach((name,j)=>p.set(name,{x:x+(i-2)*.02,y:-.08+j*.03,z:0})));p.set('thumb-tip',{x:x-.08,y:.05,z:0});return p;}
test('mandala needs two open hands held together, emits once and rearms after separation',()=>{
  const state=new GardenInteractions();let events=[];
  for(let i=0;i<15;i++)events.push(...step(state,straight(-.12),straight(.12),2,.1));
  assert.equal(events.filter(e=>e.type==='mandala').length,1);assert.equal(state.charge,1);
  assert.deepEqual(step(state,straight(-.12),straight(.12),2,.1),[]);
  step(state,new Map(),straight(.12),2,.1);assert.equal(state.charge,0);
  events=[];for(let i=0;i<15;i++)events.push(...step(state,straight(-.12),straight(.12),2,.1));
  assert.equal(events.filter(e=>e.type==='mandala').length,1);
});
test('only deliberate pointing movement draws; tracking jumps and loss do not bridge trails',()=>{
  const state=new GardenInteractions();let p=straight(0),empty=new Map();
  assert.deepEqual(step(state,p,empty,1),[]);
  p=straight(.02);assert.equal(step(state,p,empty,1)[0].type,'paint');
  assert.deepEqual(step(state,straight(1),empty,1),[]);step(state,empty,empty,1);
  assert.deepEqual(step(state,straight(1.02),empty,1),[]);
});
test('brief guide gives instructions and one question per chapter, leaving time to present',()=>{
  const guide=JSON.parse(fs.readFileSync(new URL('../webxr/assets/narration/guide.json',import.meta.url)));
  assert.equal(guide.chapters.length,4);
  guide.chapters.forEach(chapter=>{assert.ok(chapter.captions.length>=2);assert.ok(chapter.captions.at(-1).end<16);assert.equal(chapter.text.match(/\?/g)?.length,1);assert.ok(chapter.text.split(/\s+/).length<=30);assert.equal(captionAt(chapter.captions,chapter.captions[0].start),chapter.captions[0].text);assert.equal(captionAt(chapter.captions,NaN),'');assert.ok(fs.statSync(new URL('../webxr/'+chapter.file,import.meta.url)).size>1000);});
  assert.ok(guide.chapters.reduce((sum,c)=>sum+c.captions.at(-1).end,0)<60);
});
test('chapter switch cancels a pending voice load and stops the earlier clip',async()=>{
  // Use a fake context rather than browser playback to test the async race.
  const audio=Object.create(GardenAudio.prototype);let pending,started=0,stopped=0;
  Object.assign(audio,{token:0,source:null,clip:null,loading:null,cache:new Map(),guide:{chapters:[{},{}]},ready:Promise.resolve(),context:{currentTime:0,createBufferSource:()=>({connect(){},start(){started++;},stop(){stopped++;},disconnect(){}})},voice:{},applyVolume(){},buffer:index=>index===0?new Promise(resolve=>{pending=resolve;}):Promise.resolve({duration:12})});
  const first=audio.narrate(0);await Promise.resolve();await audio.narrate(1);pending({duration:10});await first;
  assert.equal(started,1);assert.equal(audio.clip.index,1);audio.stop();assert.equal(stopped,1);assert.equal(audio.clip,null);
});
test('starting ambient audio does not wait for a stalled guide download',async()=>{
  const audio=Object.create(GardenAudio.prototype);let resumed=0;
  Object.assign(audio,{context:{resume:async()=>{resumed++;}},applyVolume(){},ready:new Promise(()=>{})});
  const oldWindow=globalThis.window;globalThis.window={AudioContext:class {}};
  try{await audio.start();assert.equal(resumed,1);}finally{globalThis.window=oldWindow;}
});
test('a failed audio download is removed from the cache so replay can retry',async()=>{
  const originalFetch=globalThis.fetch;let requests=0;
  globalThis.fetch=async()=>{requests++;return {ok:requests>1,arrayBuffer:async()=>new ArrayBuffer(3)};};
  try{const audio=Object.create(GardenAudio.prototype);Object.assign(audio,{cache:new Map(),guide:{chapters:[{file:'test.mp3'}]},context:{decodeAudioData:async()=>({duration:3})}});
    await assert.rejects(audio.buffer(0));assert.equal(audio.cache.has(0),false);
    assert.equal((await audio.buffer(0)).duration,3);assert.equal(requests,2);
  }finally{globalThis.fetch=originalFetch;}
});
