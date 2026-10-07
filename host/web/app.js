const names = ['Thumb', 'Index', 'Middle', 'Ring', 'Little'];
let state = null, pending = 0, messageUntil = 0;
const $ = id => document.getElementById(id);
names.forEach((name, i) => {
  $('fingers').insertAdjacentHTML('beforeend', `<div class="finger"><label for="curl-${i}">${name}</label><input id="curl-${i}" type="range" min="0" max="1000" value="0"><output id="value-${i}">0%</output></div>`);
  $('contacts').insertAdjacentHTML('beforeend', `<label><input id="contact-${i}" type="checkbox"> ${name}</label>`);
  $('outputs').insertAdjacentHTML('beforeend', `<div class="motor"><span>${name}</span><div class="track"><div id="motor-${i}" class="fill" style="width:0"></div></div><output id="duty-${i}">0</output></div>`);
  $(`curl-${i}`).addEventListener('change', () => action('curls', {values: names.map((_, j) => Number($(`curl-${j}`).value))}));
  $(`curl-${i}`).addEventListener('input', () => {$(`value-${i}`).textContent = Math.round(Number($(`curl-${i}`).value)/10)+'%'; draw();});
  $(`contact-${i}`).addEventListener('change', () => action('contacts', {values: names.map((_, j) => $(`contact-${j}`).checked)}));
});
async function action(name, extra={}) {
  pending++;
  try {
    const response = await fetch('/api/action', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:name,...extra})});
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    state = body; $('message').textContent = 'Simulation updated.'; $('message').className = ''; messageUntil = Date.now()+2000;
  } catch(error) {$('message').textContent = error.message; $('message').className='error'; messageUntil=Date.now()+4000;}
  finally {pending--; if(state) render();}
}
function render() {
  $('state').textContent = ['Disarmed','Calibrating','Armed','Fault'][state.state];
  $('calibration').textContent = state.flags & 1 ? 'Ready' : 'Not captured';
  $('sent').textContent=state.sent; $('received').textContent=state.received;
  $('material').value=state.material;
  names.forEach((_, i) => {
    if (document.activeElement !== $(`curl-${i}`) && pending===0) $(`curl-${i}`).value=state.input_curls[i];
    $(`value-${i}`).textContent=Math.round(Number($(`curl-${i}`).value)/10)+'%';
    $(`contact-${i}`).checked=state.contacts[i]; $(`contact-${i}`).disabled=state.controller!=='dashboard';
    $(`motor-${i}`).style.width=(state.vibration[i]/160*100)+'%'; $(`duty-${i}`).textContent=state.vibration[i];
  });
  document.querySelectorAll('[data-action]').forEach(button => button.disabled=state.controller!=='dashboard');
  $('stop').textContent=state.stop_healthy?'Open stop loop':'Restore stop loop';
  $('link').textContent=state.link_enabled?'Pause command link':'Restore command link';
  $('controller').textContent=`Controller: ${state.controller}. Pressure capability: disabled.`;
  $('telemetry').textContent=state.telemetry_hex||'Waiting for stream…'; $('command').textContent=state.command_hex||'No accepted haptic request yet.';
  if(Date.now()>messageUntil){$('message').className=state.fault?'error':'';$('message').textContent=state.fault?`Fault ${state.fault}: ${['','stop loop open','command timeout','unsupported pressure','invalid sensor'][state.fault]}. Restore the cause, clear fault and arm again.`:'Simulated device online. All outputs shown here are virtual.';}
  draw();
}
function draw(){
  const canvas=$('hand'), ctx=canvas.getContext('2d');ctx.clearRect(0,0,700,270);
  ctx.fillStyle='#263c56';ctx.beginPath();ctx.roundRect(170,158,360,70,20);ctx.fill();
  names.forEach((name,i)=>{const curl=Number($(`curl-${i}`).value)/1000,x=190+i*78,length=[85,130,145,125,95][i];ctx.save();ctx.translate(x,174);ctx.rotate((i===0?-.35:0)+curl*1.3);ctx.fillStyle=state?.vibration[i]?'#83ddc9':'#54748d';ctx.beginPath();ctx.roundRect(-16,-length,32,length+12,14);ctx.fill();ctx.restore();ctx.fillStyle='#92a8be';ctx.font='12px Segoe UI';ctx.textAlign='center';ctx.fillText(name,x,251);});
}
document.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',()=>action(button.dataset.action)));
$('pose-open').onclick=()=>action('curls',{values:[0,0,0,0,0]});
$('pose-closed').onclick=()=>action('curls',{values:[1000,1000,1000,1000,1000]});
$('material').onchange=()=>action('material',{value:$('material').value});
$('stop').onclick=()=>state&&action('stop',{value:!state.stop_healthy});
$('link').onclick=()=>state&&action('link',{value:!state.link_enabled});
async function poll(){try{const response=await fetch('/api/state');if(!response.ok)throw new Error('Simulator unavailable');const next=await response.json();if(!pending){state=next;render();}}catch(error){$('message').textContent='Simulator offline. Start it using the quickstart instructions.';$('message').className='error';}setTimeout(poll,150);}
poll();draw();
