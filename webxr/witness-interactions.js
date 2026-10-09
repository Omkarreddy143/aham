import {fingerStates} from './logic.js';

export const SEED_HOMES=[{x:-.24,y:0,z:.04},{x:0,y:0,z:.04},{x:.24,y:0,z:.04}];
export const BOWL={x:0,y:-.22,z:-.18,radius:.20};
const sides=['left','right'];
const finite=p=>p&&[p.x,p.y,p.z].every(Number.isFinite);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const midpoint=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:(a.z+b.z)/2});

// All coordinates are garden-local. This state machine never sends hardware commands.
export class GardenInteractions {
  constructor(){this.reset();}
  reset(){
    this.seeds=SEED_HOMES.map(home=>({position:{...home},owner:null,cooldown:0}));
    this.hands=Object.fromEntries(sides.map(side=>[side,{pinching:false,openSeen:false,paint:null}]));
    this.charge=0;this.joined=false;this.mandalaCenter=null;this.flowers=0;
  }
  update(poses,delta,phase,enabled=true){
    const dt=Number.isFinite(delta)?Math.min(.1,Math.max(0,delta)):0,events=[];
    const palms={};
    for(const seed of this.seeds){seed.cooldown=Math.max(0,seed.cooldown-dt);}
    for(const side of sides){
      const hand=poses?.[side],state=this.hands[side];
      const thumb=hand?.get('thumb-tip'),index=hand?.get('index-finger-tip');
      const wrist=hand?.get('wrist'),base=hand?.get('middle-finger-metacarpal');
      const held=this.seeds.find(seed=>seed.owner===side);
      if(!enabled||!finite(thumb)||!finite(index)||!finite(wrist)){
        if(held){const id=this.seeds.indexOf(held);held.owner=null;held.position={...SEED_HOMES[id]};events.push({type:'cancel',seed:id});}
        state.pinching=false;state.openSeen=false;state.paint=null;continue;
      }
      const gap=distance(thumb,index),point=midpoint(thumb,index);
      const pinching=gap<(state.pinching ? .050 : .028);
      if(!pinching)state.openSeen=true;
      if(held){
        held.position={...point};
        if(!pinching||phase!==0){
          const id=this.seeds.indexOf(held);held.owner=null;held.cooldown=.8;
          const plant=phase===0&&Math.hypot(point.x-BOWL.x,point.z-BOWL.z)<BOWL.radius&&point.y>BOWL.y-.03&&point.y<BOWL.y+.38;
          events.push({type:plant?'plant':'release',seed:id,point:{...point}});
          if(plant)this.flowers++;
          held.position={...SEED_HOMES[id]};
        }
      }else if(phase===0&&pinching&&!state.pinching&&state.openSeen){
        const nearest=this.seeds.map((seed,id)=>({seed,id,distance:distance(point,seed.position)}))
          .filter(item=>!item.seed.owner&&item.seed.cooldown===0&&item.distance<.10).sort((a,b)=>a.distance-b.distance)[0];
        if(nearest){nearest.seed.owner=side;nearest.seed.position={...point};events.push({type:'grab',seed:nearest.id,side});}
      }
      const fingers=fingerStates(hand);
      // A straight index draws; curls are inferred visually from tracked joints.
      if(phase===1&&fingers.valid[1]&&fingers.curls[1]<.3&&!pinching){
        if(state.paint){const travel=distance(index,state.paint);
          if(travel>.007&&travel<.15){events.push({type:'paint',from:state.paint,to:{...index},side});state.paint={...index};}
          else if(travel>=.15)state.paint={...index};
        }else state.paint={...index};
      }else state.paint=null;
      const open=fingers.valid.slice(1).every(Boolean)&&fingers.curls.slice(1).every(curl=>curl<.45);
      if(open&&finite(base)&&!pinching)palms[side]=midpoint(wrist,base);
      state.pinching=pinching;
    }
    const together=enabled&&phase===2&&palms.left&&palms.right&&distance(palms.left,palms.right)>.07&&distance(palms.left,palms.right)<.40;
    if(together){
      this.mandalaCenter=midpoint(palms.left,palms.right);
      if(!this.joined){this.charge=Math.min(1,this.charge+dt/1.15);
        if(this.charge>=1){this.joined=true;events.push({type:'mandala',point:this.mandalaCenter});}}
    }else{this.charge=0;this.joined=false;this.mandalaCenter=null;}
    return events;
  }
}
