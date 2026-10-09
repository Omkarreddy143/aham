import test from 'node:test';
import assert from 'node:assert/strict';
import {FeedbackUploader} from '../webxr/feedback.js';

function harness() {
  let now=0;const sent=[],results=[];
  const upload=new FeedbackUploader({stream:'a'.repeat(32),clock:()=>now,
    post:(url,options)=>new Promise((resolve,reject)=>sent.push({url,payload:JSON.parse(options.body),resolve,reject})),
    onResult:(...args)=>results.push(args)});
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
