import {fetchJSON} from './network.js';

// Acknowledgements can be slower than the 250 ms data lease. Keep a small
// bounded pipeline, not one round-trip barrier per sample. The relay rejects
// reordered samples; forced zeroes get one reserved slot ahead of regular data.
export class FeedbackUploader {
  constructor({post=fetchJSON,clock=()=>performance.now(),stream=crypto.randomUUID().replaceAll('-',''),
               onResult=()=>{},onError=()=>{},resample=null}={}) {
    this.post=post;this.clock=clock;this.stream=stream;
    this.onResult=onResult;this.onError=onError;
    this.resample=resample;
    this.sample=0;this.inFlight=0;this.urgentBusy=false;this.queuedZero=null;
    this.lastPost=-Infinity;this.lastResult=-1;
  }
  submit(cue,grip,urgent=false,intent='sample') {
    const now=this.clock();
    if(urgent && this.urgentBusy) {
      const priority={'sample':0,'grip-release':1,'stop':2};
      if(!this.queuedZero || priority[intent]>=priority[this.queuedZero.intent]) this.queuedZero={cue,grip,intent};
      return false;
    }
    if(!urgent && (this.inFlight>=3 || now-this.lastPost<50))return false;
    const sample=this.sample++;
    this.lastPost=now;this.inFlight++;
    if(urgent)this.urgentBusy=true;
    this.post('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({version:1,stream:this.stream,sample,cue,grip})},3000)
      .then(({response,value})=>{
        if(sample<this.lastResult || value.ignored)return;
        this.lastResult=sample;
        this.onResult(response,value,{time:this.clock(),roundTripMs:this.clock()-now});
      }).catch(error=>{
        if(sample>=this.lastResult){this.lastResult=sample;this.onError(error);}
      }).finally(()=>{
        this.inFlight--;
        if(urgent)this.urgentBusy=false;
        if(this.queuedZero && !this.urgentBusy) {
          const queued=this.queuedZero;this.queuedZero=null;
          // Re-read current XR state: queued touch/pose values may be obsolete.
          let current=null;
          try {current=this.resample?.();} catch {}
          const stop=queued.intent==='stop' || !current;
          const cue=stop?{...queued.cue,trackingValid:false,duties:[0,0,0,0,0],patterns:[0,0,0,0,0]}:current.cue;
          const grip=stop || queued.intent==='grip-release'?
            {...(current?.grip || queued.grip),...(stop?{trackingValid:false}:{}),holding:false,objectId:null,gripMode:'none',
              resistance:[0,0,0,0,0],referenceCurl:[0,0,0,0,0]}:current.grip;
          this.submit(cue,grip,true,queued.intent);
        }
      });
    return true;
  }
}
