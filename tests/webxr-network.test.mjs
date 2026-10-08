import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchJSON} from '../webxr/network.js';

test('uploads JSON when AbortSignal.timeout is unavailable',async()=>{
  const originalFetch=globalThis.fetch, originalTimeout=AbortSignal.timeout;
  AbortSignal.timeout=undefined;
  let request;
  globalThis.fetch=async(url,options)=>{
    request={url,options};
    return {ok:true,json:async()=>({accepted:true})};
  };
  try {
    const result=await fetchJSON('/api/cue',{method:'POST',body:'{}'},50);
    assert.equal(request.url,'/api/cue');
    assert.equal(request.options.method,'POST');
    assert.equal(request.options.body,'{}');
    assert.equal(request.options.signal.aborted,false);
    assert.deepEqual(result.value,{accepted:true});
  } finally {globalThis.fetch=originalFetch;AbortSignal.timeout=originalTimeout;}
});

test('aborts a stalled JSON body so later uploads are not held busy',async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(url,{signal})=>({json:()=>new Promise((resolve,reject)=>{
    signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})),{once:true});
  })});
  try {
    await assert.rejects(fetchJSON('/api/cue',{},10),{name:'AbortError'});
  } finally {globalThis.fetch=originalFetch;}
});
