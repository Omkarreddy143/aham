import {fetchJSON} from './network.js';

export function captionAt(captions,time){
  if(!Number.isFinite(time)||time<0)return '';
  const current=captions?.find(c=>time>=c.start&&time<c.end+.35);
  return current?.text??'';
}

export class GardenAudio {
  constructor(){
    this.context=null;this.volume=.70;this.voiceVolume=.95;this.muted=false;this.voiceEnabled=true;
    this.step=0;this.token=0;this.source=null;this.clip=null;this.guide=null;this.loading=null;this.cache=new Map();this.paused=false;this.error='';
    this.ready=this.loadGuide();
  }
  async loadGuide(){
    try{const {response,value}=await fetchJSON('./assets/narration/guide.json',{},8000);if(!response.ok)throw Error('Guide unavailable');this.guide=value;}
    catch{this.error='Voice files unavailable. Chapter instructions remain visible.';}
  }
  async start(){
    const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return;
    if(!this.context){
      this.context=new Context();
      const compressor=this.context.createDynamicsCompressor();compressor.threshold.value=-12;compressor.ratio.value=4;compressor.connect(this.context.destination);
      this.music=this.context.createGain();this.music.connect(compressor);
      this.voice=this.context.createGain();this.voice.connect(compressor);
      const filter=this.context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1300;filter.connect(this.music);
      [130.81,196,261.63].forEach((frequency,i)=>{
        const oscillator=this.context.createOscillator(),gain=this.context.createGain();oscillator.type=i?'sine':'triangle';oscillator.frequency.value=frequency;gain.gain.value=[.17,.065,.05][i];oscillator.connect(gain);gain.connect(filter);oscillator.start();
      });
      this.timer=setInterval(()=>{if(this.context.state==='running'&&!this.paused)this.chime([261.63,329.63,392,440,523.25,440,392,329.63][this.step++%8],.09,3.5);},2800);
    }
    await this.context.resume();this.applyVolume();
    // Starting the journey must not wait on a speech download.
    this.ready.then(()=>{if(this.guide)for(let i=0;i<this.guide.chapters.length;i++)this.buffer(i).catch(()=>{});});
  }
  applyVolume(){
    if(!this.context)return;
    this.music.gain.setTargetAtTime(this.muted?0:this.volume*(this.source&&this.voiceEnabled ? .28 : 1),this.context.currentTime,.18);
    this.voice.gain.setTargetAtTime(this.voiceEnabled?this.voiceVolume:0,this.context.currentTime,.05);
  }
  async buffer(index){
    if(!this.cache.has(index))this.cache.set(index,(async()=>{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
      try{const response=await fetch(this.guide.chapters[index].file,{signal:controller.signal});if(!response.ok)throw Error('Voice clip unavailable');
        return await this.context.decodeAudioData(await response.arrayBuffer());}
      finally{clearTimeout(timer);}
    })().catch(error=>{this.cache.delete(index);throw error;}));
    return this.cache.get(index);
  }
  stop(){this.token++;if(this.source){this.source.onended=null;this.source.stop();this.source.disconnect();this.source=null;}this.clip=null;this.loading=null;this.applyVolume();}
  async narrate(index){
    this.stop();if(!this.context)return;const token=this.token;this.loading=index;this.error='';
    try{
      await this.ready;if(!this.guide)throw Error('Voice guide unavailable');
      const buffer=await this.buffer(index);if(token!==this.token)return;
      const source=this.context.createBufferSource();source.buffer=buffer;source.connect(this.voice);
      this.source=source;this.clip={index,start:this.context.currentTime,duration:buffer.duration};this.loading=null;
      source.onended=()=>{if(this.source===source){source.disconnect();this.source=null;this.applyVolume();}};
      source.start();this.applyVolume();
    }catch{if(token===this.token){this.loading=null;this.error='Voice unavailable. Read the chapter prompts.';}}
  }
  caption(){return this.clip&&this.guide?captionAt(this.guide.chapters[this.clip.index].captions,this.context.currentTime-this.clip.start):'';}
  status(){
    if(this.error)return this.error;if(this.loading!==null)return 'Loading AI guide…';
    if(this.source)return this.voiceEnabled?'AI guide speaking · captions below':'Voice muted · captions below';
    return this.context?'AI guide ready · replay this chapter anytime':'AI voice starts with Start or Enter VR';
  }
  setPaused(paused){
    if(paused===this.paused)return;this.paused=paused;
    if(this.context)(paused?this.context.suspend():this.context.resume()).catch(()=>{});
  }
  chime(frequency=523.25,strength=.18,duration=1.8){
    if(!this.context||this.context.state!=='running')return;
    const now=this.context.currentTime;
    [1,2.004].forEach((harmonic,i)=>{
      const oscillator=this.context.createOscillator(),gain=this.context.createGain();oscillator.type='sine';oscillator.frequency.value=frequency*harmonic;
      gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(strength/(i+1),now+.025);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
      oscillator.connect(gain);gain.connect(this.music);oscillator.start(now);oscillator.stop(now+duration+.05);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
    });
  }
  close(){clearInterval(this.timer);this.stop();this.context?.close();}
}
