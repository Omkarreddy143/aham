import test from 'node:test';
import assert from 'node:assert/strict';
import {FeedbackUploader} from '../webxr/feedback.js';

function harness(resample=null) {
  let now=0;const sent=[],results=[];
  const upload=new FeedbackUploader({stream:'a'.repeat(32),clock:()=>now,
    post:(url,options)=>new Promise((resolve,reject)=>sent.push({url,payload:JSON.parse(options.body),resolve,reject})),
    onResult:(...args)=>results.push(args),resample});
  return {upload,sent,results,at:value=>{now=value;}};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const reply={response:{ok:true},value:{accepted:true,sequence:1}};

test('slow replies do not block the next two current samples; pipeline is bounded',()=>{
  const h=harness();
  assert.equal(h.upload.submit({duties:[1]},{resistance:[2]}),true);
  h.at(50);assert.equal(h.upload.submit({duties:[3]},{resistance:[4]}),true);
  h.at(100);assert.equal(h.upload.submit({duties:[5]},{resistance:[6]}),true);
  h.at(150);assert.equal(h.upload.submit({},{}),false);
  assert.equal(h.sent.length,3);
  assert.deepEqual(h.sent.map(r=>r.payload.sample),[0,1,2]);
  assert.equal(h.sent[0].url,'/api/feedback');
  assert.deepEqual(h.sent[2].payload.grip.resistance,[6]);
});
test('regular updates are rate limited independently of render rate',()=>{
  const h=harness();h.upload.submit({},{});
  h.at(49);assert.equal(h.upload.submit({},{}),false);
  h.at(50);assert.equal(h.upload.submit({},{}),true);
});
test('a forced stop has a reserved slot and stale queued poses become zeroes',async()=>{
  const h=harness();for(const now of [0,50,100]){h.at(now);h.upload.submit({},{});}
  assert.equal(h.upload.submit({}, {},true),true);
  h.upload.submit({trackingValid:true,duties:[95,95,95,95,95]},
    {trackingValid:true,holding:true,resistance:[50,50,50,50,50]},true);
  assert.equal(h.sent.length,4);
  h.sent[3].resolve(reply);await settle();
  assert.equal(h.sent.length,5);
  assert.deepEqual(h.sent[4].payload.cue.duties,[0,0,0,0,0]);
  assert.equal(h.sent[4].payload.grip.holding,false);
  assert.equal(h.upload.inFlight,4);
});
test('late replies cannot overwrite diagnostics for a newer accepted sample',async()=>{
  const h=harness();h.upload.submit({},{});h.at(50);h.upload.submit({},{});
  h.sent[1].resolve(reply);await settle();
  h.sent[0].resolve(reply);await settle();
  assert.equal(h.results.length,1);
  assert.equal(h.upload.inFlight,0);
});
test('ignored old samples do not mark the link rejected',async()=>{
  const h=harness();h.upload.submit({},{});
  h.sent[0].resolve({response:{ok:true},value:{accepted:false,ignored:true}});await settle();
  assert.equal(h.results.length,0);
  assert.equal(h.upload.inFlight,0);
});

const trackedPayload=(duties=[0,0,0,0,0],resistance=[0,0,0,0,0])=>({
  cue:{trackingValid:true,duties,patterns:duties.map(value=>value?1:0)},
  grip:{trackingValid:true,holding:resistance.some(Boolean),objectId:resistance.some(Boolean)?'mint':null,
    gripMode:resistance.some(Boolean)?'grip':'none',resistance,referenceCurl:resistance.map(value=>value?50:0)}
});
test('queued finger loss re-reads current channels instead of invalidating the whole hand',async()=>{
  let current=trackedPayload([95,95,95,95,95]);const h=harness(()=>current);
  h.upload.submit(current.cue,current.grip,true);
  h.upload.submit(current.cue,current.grip,true);
  current=trackedPayload([95,0,95,95,95]);
  h.sent[0].resolve(reply);await settle();
  const next=h.sent[1].payload;
  assert.equal(next.cue.trackingValid,true);
  assert.equal(next.grip.trackingValid,true);
  assert.deepEqual(next.cue.duties,[95,0,95,95,95]);
});
test('queued grip release zeros resistance while preserving currently tracked touch',async()=>{
  let current=trackedPayload([95,95,95,95,95],[18,18,18,18,18]);const h=harness(()=>current);
  h.upload.submit(current.cue,current.grip,true);
  h.upload.submit(current.cue,current.grip,true,'grip-release');
  current=trackedPayload([0,95,0,0,0],[42,42,42,42,42]);
  h.sent[0].resolve(reply);await settle();
  const next=h.sent[1].payload;
  assert.equal(next.cue.trackingValid,true);
  assert.deepEqual(next.cue.duties,[0,95,0,0,0]);
  assert.equal(next.grip.trackingValid,true);
  assert.equal(next.grip.holding,false);
  assert.equal(next.grip.objectId,null);
  assert.deepEqual(next.grip.resistance,[0,0,0,0,0]);
});
test('queued grip loss cannot fabricate complete tracking on the latest partial hand',async()=>{
  const current=trackedPayload();current.grip.trackingValid=false;const h=harness(()=>current);
  h.upload.submit(current.cue,current.grip,true);
  h.upload.submit(current.cue,current.grip,true,'grip-release');
  h.sent[0].resolve(reply);await settle();
  assert.equal(h.sent[1].payload.cue.trackingValid,true);
  assert.equal(h.sent[1].payload.grip.trackingValid,false);
});
test('queued full stop stays a stop even if later samples recover',async()=>{
  const current=trackedPayload([95,95,95,95,95],[42,42,42,42,42]);const h=harness(()=>current);
  h.upload.submit(current.cue,current.grip,true);
  h.upload.submit(current.cue,current.grip,true,'stop');
  h.upload.submit(current.cue,current.grip,true,'sample');
  h.sent[0].resolve(reply);await settle();
  const next=h.sent[1].payload;
  assert.equal(next.cue.trackingValid,false);
  assert.equal(next.grip.trackingValid,false);
  assert.deepEqual(next.cue.duties,[0,0,0,0,0]);
  assert.deepEqual(next.grip.resistance,[0,0,0,0,0]);
});
test('no current XR sample available sends invalid zeros rather than stale queued touch',async()=>{
  const current=trackedPayload([95,95,95,95,95],[42,42,42,42,42]);const h=harness(()=>null);
  h.upload.submit(current.cue,current.grip,true);
  h.upload.submit(current.cue,current.grip,true,'sample');
  h.sent[0].resolve(reply);await settle();
  const next=h.sent[1].payload;
  assert.equal(next.cue.trackingValid,false);
  assert.equal(next.grip.trackingValid,false);
  assert.deepEqual(next.cue.duties,[0,0,0,0,0]);
  assert.deepEqual(next.grip.resistance,[0,0,0,0,0]);
});
