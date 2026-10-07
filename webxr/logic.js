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

export function fingerStates(poses) {
  const valid=CHAINS.map(chain => chain.every(name => finitePoint(poses?.get(name))));
  return {valid, curls:CHAINS.map((chain,i) => valid[i] ? curl(chain.slice(1).map(name=>poses.get(name))) : null)};
}

export function handCue(poses, targets, fingerValid) {
  const duties = [0,0,0,0,0], patterns = [0,0,0,0,0];
  const contacts = [null,null,null,null,null];
  CHAINS.forEach((chain,i) => {
    const tip=poses?.get(chain.at(-1));
    if(!fingerValid?.[i] || !tip) return;
    const contact=targets.find(target=>sphereTouchesBox(tip,tip.radius ?? 0.008,target.box));
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
