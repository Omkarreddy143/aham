import {JOINTS} from './logic.js';

export const emptyHands = () => ({left:new Map(),right:new Map()});

// Keep the complete left/right XR joint sets independent. Missing poses stay
// missing; there is no synthetic fallback during a real headset session.
export function readHandPoses(frame, referenceSpace, inputSources) {
  const hands=emptyHands();
  for(const input of inputSources) {
    if(!input.hand || !['left','right'].includes(input.handedness)) continue;
    const poses=hands[input.handedness];
    for(const name of JOINTS) {
      const space=input.hand.get(name);
      if(!space) continue;
      const pose=frame.getJointPose(space,referenceSpace);
      if(!pose) continue;
      const p=pose.transform.position, q=pose.transform.orientation;
      if(![p.x,p.y,p.z,q.x,q.y,q.z,q.w].every(Number.isFinite)) continue;
      poses.set(name,{x:p.x,y:p.y,z:p.z,
        radius:Number.isFinite(pose.radius) && pose.radius>0 ? pose.radius : 0.008,
        orientation:{x:q.x,y:q.y,z:q.z,w:q.w},emulatedPosition:pose.emulatedPosition});
    }
  }
  return hands;
}
