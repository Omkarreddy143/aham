export const DURATION = 120;
export const PHASES = [
  {start:0, end:35, title:'I act.', label:'AGENCY', action:'Pinch a seed. Carry it above the bowl, then open to plant.', question:'Does controlling this hand make it yours?', color:0xa9e5d5},
  {start:35, end:65, title:'Is this mine?', label:'BODY OWNERSHIP', action:'Point your index finger and move it to draw a ribbon of light.', question:'Does this feel like your hand, or something you control?', color:0xf0cf90},
  {start:65, end:100, title:'The form changes.', label:'IDENTITY', action:'Bring two open hands close together. Hold to form a mandala.', question:'When the form changes, does the sense of “mine” change?', color:0xbab3ed},
  {start:100, end:120, title:'I notice.', label:'THE WITNESS', action:'Let your hands rest. Notice your hand, then the thought “my hand”.', question:'What is aware of both?', color:0xe6d8b6},
];
export function phaseAt(seconds) {
  const safe=Number.isFinite(seconds)?Math.max(0,seconds):0;
  const index=PHASES.findIndex(phase=>safe<phase.end);
  return index<0 ? PHASES.length-1 : index;
}
export class Journey {
  constructor(){this.elapsed=0;this.running=false;}
  start(){this.elapsed=0;this.running=true;}
  advance(deltaSeconds,visible=true){
    // Hidden/background frames cannot skip the presentation on return.
    if(this.running && visible && Number.isFinite(deltaSeconds) && deltaSeconds>0)
      this.elapsed=Math.min(DURATION,this.elapsed+Math.min(deltaSeconds,0.25));
    if(this.elapsed>=DURATION)this.running=false;
  }
  next(){const next=PHASES[phaseAt(this.elapsed)+1];this.elapsed=next?next.start:DURATION;this.running=!!next;}
  get phase(){return phaseAt(this.elapsed);}
  get finished(){return this.elapsed>=DURATION;}
}
const TIPS=['thumb-tip','index-finger-tip','middle-finger-tip','ring-finger-tip','pinky-finger-tip'];
export function touchesLight(poses,center,radius,margin=0){
  if(!poses || !center || ![center.x,center.y,center.z,radius,margin].every(Number.isFinite) || radius<0)return false;
  return TIPS.some(name=>{
    const p=poses.get(name);
    if(!p || ![p.x,p.y,p.z].every(Number.isFinite))return false;
    return Math.hypot(p.x-center.x,p.y-center.y,p.z-center.z)<=radius+(Number.isFinite(p.radius)?Math.max(0,p.radius):0.008)+Math.max(0,margin);
  });
}
