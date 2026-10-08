// Fixed channel order shared with the AHAM board protocol.
export const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];
export const FINGER_LABELS = ['Thumb', 'Index', 'Middle', 'Ring', 'Little'];
export const CHAINS = [
  ['wrist', 'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'],
  ['wrist', 'index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip'],
  ['wrist', 'middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip'],
  ['wrist', 'ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip'],
  ['wrist', 'pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip'],
];
export const JOINTS = ['wrist', ...CHAINS.flatMap(chain => chain.slice(1))];
export const MATERIALS = [
  {name: 'Smooth', duty: 100, pattern: 1, color: 0x62c8c2},
  {name: 'Rough', duty: 150, pattern: 2, color: 0xe1a565},
  {name: 'Soft', duty: 80, pattern: 3, color: 0xa998e1},
];
const finitePoint = p => p && [p.x, p.y, p.z].every(Number.isFinite);

// Angle between adjacent bone directions: straight = 0. This is a visual
// approximation of curl, not a measured anatomical joint calibration.
export function curl(chain) {
  if (!chain || chain.length < 3 || !chain.every(finitePoint)) return null;
  let total = 0;
  let count = 0;
  for (let i = 1; i < chain.length - 1; i++) {
    const a = chain[i - 1], b = chain[i], c = chain[i + 1];
    const u = [b.x-a.x, b.y-a.y, b.z-a.z];
    const v = [c.x-b.x, c.y-b.y, c.z-b.z];
    const magnitude = Math.hypot(...u) * Math.hypot(...v);
    if (magnitude < 1e-9) return null;
    const dot = u.reduce((sum, value, j) => sum + value*v[j], 0) / magnitude;
    total += Math.acos(Math.max(-1, Math.min(1, dot)));
    count++;
  }
  return Math.min(1, Math.max(0, total / (count * Math.PI/2)));
}

export function sphereTouchesBox(point, radius, box) {
  if (!finitePoint(point) || !Number.isFinite(radius) || radius < 0) return false;
  const distance2 = ['x','y','z'].reduce((sum, axis) => {
    const nearest = Math.max(box.min[axis], Math.min(box.max[axis], point[axis]));
    return sum + (point[axis] - nearest)**2;
  }, 0);
  return distance2 <= radius*radius;
}

// Contact follows the core body; its decorative rings are not touch surfaces.
export function sphereTouchesTarget(point, radius, target) {
  if (!finitePoint(point) || !Number.isFinite(radius) || radius < 0) return false;
  if (target.sphere && !target.orientedBox) {
    const {center, radius:bodyRadius}=target.sphere;
    return finitePoint(center) && Number.isFinite(bodyRadius) && bodyRadius>=0 &&
      Math.hypot(point.x-center.x,point.y-center.y,point.z-center.z)<=radius+bodyRadius;
  }
  if (target.orientedBox) {
    const {center,quaternion:q,halfSize:h}=target.orientedBox;
    if(!finitePoint(center) || !finitePoint(h) || !q ||
       ![q.x,q.y,q.z,q.w].every(Number.isFinite) || Math.min(h.x,h.y,h.z)<0) return false;
    const norm=q.x*q.x+q.y*q.y+q.z*q.z+q.w*q.w;
    if(norm<0.5) return false;
    const x=point.x-center.x,y=point.y-center.y,z=point.z-center.z;
    // Inverse quaternion rotation; normalization also handles harmless XR rounding.
    const tx=2*(-q.y*z+q.z*y),ty=2*(-q.z*x+q.x*z),tz=2*(-q.x*y+q.y*x);
    const p={x:x+(q.w*tx-q.y*tz+q.z*ty)/norm,
      y:y+(q.w*ty-q.z*tx+q.x*tz)/norm,z:z+(q.w*tz-q.x*ty+q.y*tx)/norm};
    return sphereTouchesBox(p,radius,{min:{x:-h.x,y:-h.y,z:-h.z},max:h});
  }
  return !!target.box && sphereTouchesBox(point,radius,target.box);
}

export function fingerStates(poses) {
  const valid=CHAINS.map(chain => chain.every(name => finitePoint(poses?.get(name))));
  return {valid, curls:CHAINS.map((chain,i) => valid[i] ? curl(chain.slice(1).map(name=>poses.get(name))) : null)};
}

export function handCue(poses, targets, fingerValid, previousContacts=[], exitMargin=0) {
  const duties = [0,0,0,0,0], patterns = [0,0,0,0,0];
  const contacts = [null,null,null,null,null];
  CHAINS.forEach((chain,i) => {
    const tip=poses?.get(chain.at(-1));
    if(!fingerValid?.[i] || !tip) return;
    const retained=targets.find(target=>target.name===previousContacts[i] &&
      sphereTouchesTarget(tip,(tip.radius ?? 0.008)+exitMargin,target));
    const contact=retained || targets.find(target=>sphereTouchesTarget(tip,tip.radius ?? 0.008,target));
    if(contact) {duties[i]=contact.duty;patterns[i]=contact.pattern;contacts[i]=contact.name;}
  });
  return {duties, patterns, contacts};
}

export function cueRequest(cue, source, hand, trackingValid) {
  // Preview can demonstrate a calculated cue; its transmitted channels are zero.
  const live = source === 'webxr' && trackingValid;
  return {version:1, source, hand, trackingValid:!!trackingValid,
    duties: live ? cue.duties : [0,0,0,0,0],
    patterns: live ? cue.patterns : [0,0,0,0,0]};
}
