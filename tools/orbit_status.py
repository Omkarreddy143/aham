"""Show the verified Orbit URL and diagnose Quest -> laptop -> ESP, without arming.

Does not open a serial port, send output packets, probe/replace an ESP session,
or restart services. USB STATUS is the only optional board command, delivered
through the already-running companion. Old log lines never count as live data.
"""
import argparse
import ast
from concurrent.futures import ThreadPoolExecutor
import ipaddress
import json
from pathlib import Path
import re
import subprocess
import sys
import time
from urllib.error import HTTPError
from urllib.request import ProxyHandler, build_opener

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'host'))
import vr_link
from aham.wifi_monitor import NoRedirect
from aham.webxr_relay import validate_external_origin

REPORT = ROOT / 'ORBIT-STATUS.txt'
FRESH_MS = 250


def http_probe(url, kind='json', timeout=4):
    started = time.monotonic()
    try:
        with build_opener(ProxyHandler({}), NoRedirect()).open(url, timeout=timeout) as reply:
            data = reply.read(32769)
            if reply.status != 200 or len(data) > 32768:
                raise ValueError('Unexpected or oversized response')
            if kind == 'game':
                valid = b'Orbit Foundry' in data and b'./app.js' in data
                return {'ok':valid, 'error':'' if valid else 'The page is not Orbit Foundry'}
            value = json.loads(data)
            if not isinstance(value, dict) or value.get('mode') != 'monitor-only':
                raise ValueError('The address is not the AHAM relay')
            return {'ok':True, 'data':value, 'sampledAt':time.monotonic(), 'ms':round((time.monotonic()-started)*1000)}
    except HTTPError as error:
        return {'ok':False, 'error':f'HTTP {error.code}'}
    except (OSError, ValueError, RecursionError):
        # No raw exceptions, server text, headers, paths or credentials in reports.
        return {'ok':False, 'error':'Unreachable, timed out, or not a valid AHAM response'}


def confined_log(settings):
    value=settings.get('wifiGloveLog')
    if not isinstance(value,str):
        return None
    path=Path(value).resolve()
    try:path.relative_to((ROOT / '.build').resolve())
    except ValueError:return None
    return path if path.is_file() else None


def companion_alive(settings, records):
    """A saved PID alone is insufficient, even for issuing a read-only STATUS."""
    record=next((r for r in records if r.get('ProcessId')==settings.get('wifiGlovePid')),None)
    if not record or record.get('Name')!='python.exe':return False
    command=(record.get('CommandLine') or '').replace('\\','/').lower()
    executable=(record.get('ExecutablePath') or '').replace('\\','/').lower()
    # This laptop's managed companion uses a runner that reads transport/log
    # settings itself, so COM7 and wifi-glove are not in its OS command line.
    runner=(ROOT / '.build/wifi-glove-live-runner.py').as_posix().lower()
    if executable==vr_link.PYTHON.as_posix().lower() and re.search(re.escape(runner)+r'(?:"|\s|$)',command):
        return True
    script=(ROOT / 'host/run.py').as_posix().lower()
    correct_script=script in command or ('host/run.py' in command and executable==vr_link.PYTHON.as_posix().lower())
    if not correct_script or not re.search(r'\bwifi-glove\b',command):return False
    serial=settings.get('gloveSerialPort')
    if serial:
        return isinstance(serial,str) and re.search(r'--serial-port\s+"?'+re.escape(serial.lower())+r'(?:"|\s|$)',command) is not None
    try:address=str(ipaddress.IPv4Address(settings.get('espIp','')))
    except (ValueError,TypeError):return False
    return re.search(r'--esp-ip\s+"?'+re.escape(address)+r'(?:"|\s|$)',command) is not None


def parse_receipt(line):
    if not line.startswith('ESP FIVE '):return None
    try:
        def integer(name,maximum):
            match=re.search(r'\b'+name+r'=(\d+)\b',line)
            if not match:raise ValueError()
            value=int(match[1])
            if not 0<=value<=maximum:raise ValueError()
            return value
        def array(name,maximum):
            match=re.search(r'\b'+re.escape(name)+r'=(\[[\d, ]{1,60}\])',line)
            if not match:raise ValueError()
            values=ast.literal_eval(match[1])
            if len(values)!=5 or any(type(v) is not int or not 0<=v<=maximum for v in values):raise ValueError()
            return values
        holding=re.search(r'\bHOLD=(True|False)\b',line)
        if not holding:raise ValueError()
        reason=re.search(r'\bLAST_REASON=([A-Z_]+)\b',line)
        return dict(sequence=integer('seq',65535),vibration=array('VIB',160),resistance=array('RES%',80),
                    motorMask=integer('M_ARM',31),servoMask=integer('S_ARM',31),pwm=array('PWM',160),
                    servoUs=array('SERVO_US',4095),servoSignalMask=integer('S_SIGNAL',31),
                    holding=holding[1]=='True',reason=reason[1] if reason else 'UNKNOWN')
    except (ValueError,TypeError,SyntaxError):return None


def parse_board(line):
    if not line.startswith('USB BOARD: STATUS '):return None
    try:
        values={name:int(value) for name,value in re.findall(r'\b(PCA|STOP_CLOSED|WIFI|LIVE|AGE_MS|M_ALLOWED|S_ALLOWED)=(\d+)\b',line)}
        if any(values.get(name,0)>1 for name in ('PCA','STOP_CLOSED','WIFI','LIVE')):return None
        if any(values.get(name,0)>31 for name in ('M_ALLOWED','S_ALLOWED')):return None
        return values if {'PCA','STOP_CLOSED','LIVE'}<=values.keys() else None
    except ValueError:return None


def sample_companion(settings, alive, seconds=2.2):
    """Only bytes appended during this check prove a current companion receipt."""
    log=confined_log(settings)
    result={'alive':alive,'receipt':None,'board':None,'error':None}
    if not alive or log is None:return result
    try:
        with log.open('rb') as stream:
            stream.seek(0,2)
            control=ROOT / '.build/glove-control.txt'
            if settings.get('gloveSerialPort') and control.is_file():
                # Never replay an ARM, open COM7, or emit anything other than STATUS.
                with control.open('ab') as output:output.write(b'STATUS\n')
            end=time.monotonic()+seconds;buffer=b'';received_at=None;board_at=None
            while time.monotonic()<end:
                buffer+=stream.read(32768)
                if len(buffer)>65536:buffer=buffer[-32768:]
                while b'\n' in buffer:
                    line,_,buffer=buffer.partition(b'\n');text=line.decode('ascii',errors='replace').strip()
                    receipt=parse_receipt(text)
                    if receipt is not None:result['receipt']=receipt;received_at=time.monotonic()
                    board=parse_board(text)
                    if board is not None:result['board']=board;board_at=time.monotonic()
                time.sleep(.05)
            result['receiptAgeMs']=None if received_at is None else int((time.monotonic()-received_at)*1000)
            result['boardAgeMs']=None if board_at is None else int((time.monotonic()-board_at)*1000)
            result['sampledAt']=time.monotonic()
    except OSError:result['error']='Cannot read the running companion log/control file'
    return result


def fresh(value, maximum=FRESH_MS, elapsed_ms=0):
    return isinstance(value,dict) and type(value.get('ageMs')) is int and 0<=value['ageMs']+elapsed_ms<maximum


def classify_input(preview, connection, elapsed_ms=0, connection_elapsed_ms=0):
    values=[preview.get('cue'),preview.get('grip')]
    actual=[v for v in values if fresh(v,elapsed_ms=elapsed_ms) and v.get('source')=='webxr']
    if any(v.get('hand')=='right' and v.get('trackingValid') is True for v in actual):return 'LIVE'
    if actual:return 'HAND_LOST'
    if any(fresh(v,elapsed_ms=elapsed_ms) and v.get('source')=='desktop-preview' for v in values):return 'PREVIEW'
    upload=connection.get('lastUpload')
    if isinstance(upload,dict) and fresh(upload,10000,connection_elapsed_ms) and upload.get('status')!=200:return 'REJECTED'
    return 'WAITING'


def make_report(settings, local, public, game, preview, connection, companion, ports, inventory_error=None):
    """Pure status interpretation, tested without a headset or actuators."""
    lines=['AHAM / ORBIT FOUNDRY CONNECTION CHECK',time.strftime('%d %b %Y  %H:%M:%S'),
           'Check only: no ARM, JOG, output test, firmware upload or service restart.','']
    fixes=[]
    working=bool(local.get('ok') and public.get('ok') and game.get('ok'))
    if working:
        url=settings['origin']+'/game.html'
        lines+=['WORKING QUEST LINK: '+url,'Open this exact link on Quest -> Right hand -> Enter VR.']
    else:
        lines+=['WORKING QUEST LINK: not verified. Do not rely on an older browser tab.']
        if settings.get('origin'):lines+=['Last saved link (not confirmed working): '+settings['origin']+'/game.html']
    lines+=['','LAPTOP WEBSITE: '+('OK' if local.get('ok') else 'NOT REACHABLE')]
    if not local.get('ok'):fixes.append('Run "Open VR Link.cmd" from this folder to start/repair the laptop website and HTTPS link.')
    lines+=['PUBLIC HTTPS LINK: '+('OK' if public.get('ok') else 'NOT REACHABLE - '+public.get('error','No saved link')),
            'ORBIT GAME PAGE: '+('OK' if game.get('ok') else 'NOT VERIFIED')]
    if not public.get('ok') or not game.get('ok'):
        fixes.append('Keep laptop Internet connected. Run "Open VR Link.cmd"; if it still fails, run "Refresh VR Link.cmd". Close old AHAM tabs on Quest and open the newly printed /game.html address.')
    if not local.get('ok'):quest='UNKNOWN'
    elif not preview.get('ok'):quest='UNKNOWN';fixes.append('The relay API is unavailable. Run "Open VR Link.cmd", then rerun this check.')
    else:
        now=time.monotonic()
        quest=classify_input(preview['data'],connection.get('data',{}),
            max(0,(now-preview.get('sampledAt',now))*1000),max(0,(now-connection.get('sampledAt',now))*1000))
    labels={'LIVE':'LIVE - fresh right-hand tracking data reached the laptop',
            'HAND_LOST':'CONNECTED, but right-hand tracking is missing',
            'PREVIEW':'DESKTOP PREVIEW ONLY - this is not Quest data',
            'REJECTED':'UPLOAD REJECTED - headset tried to send, relay refused it',
            'WAITING':'WAITING - no fresh Quest data', 'UNKNOWN':'UNKNOWN - restore laptop website first'}
    lines+=['','QUEST -> LAPTOP: '+labels[quest]]
    if quest in ('HAND_LOST','PREVIEW','WAITING','REJECTED'):
        fixes.append('On Quest open the WORKING QUEST LINK above, choose Right hand, enter Orbit VR, put controllers aside and keep your right hand visible. A GitHub/static page or Witness Garden cannot send live glove data to this laptop.')
    if quest=='WAITING':fixes.append('If already inside VR, exit, reload the current link and re-enter. Hands can keep moving locally after the network upload stops.')
    diagnostics=connection.get('data',{})
    if diagnostics:
        lines+=['Uploads accepted/rejected: '+str(diagnostics.get('accepted',0))+' / '+str(diagnostics.get('rejected',0))]
        age=diagnostics.get('lastCueAgeMs')
        elapsed=max(0,(time.monotonic()-connection.get('sampledAt',time.monotonic()))*1000)
        lines+=['Last accepted cue: '+('never/unknown' if type(age) is not int or age<0 else f'{(age+elapsed)/1000:.1f} seconds ago')]
    serial=settings.get('gloveSerialPort');receipt=companion.get('receipt')
    now=time.monotonic();receipt_age=companion.get('receiptAgeMs')
    live_receipt=receipt is not None and receipt_age is not None and receipt_age+max(0,(now-companion.get('sampledAt',now))*1000)<1500
    lines+=['','LAPTOP -> ESP TRANSPORT: '+('USB '+serial+' (115200 baud)' if serial else 'Wi-Fi / '+str(settings.get('espIp','not configured'))),
            'GLOVE COMPANION: '+('RUNNING' if companion.get('alive') else 'NOT CONFIRMED RUNNING'),
            'ESP REPLIES: '+('LIVE - fresh authenticated receipt observed' if live_receipt else 'NO FRESH REPLY during this check')]
    if inventory_error:lines+=['Process/port check: '+inventory_error]
    if serial:
        available=None if ports is None else serial.upper() in {p.upper() for p in ports}
        lines+=['USB PORT: '+('UNKNOWN' if available is None else 'DETECTED' if available else 'NOT DETECTED')]
        if available is False:fixes.append(f'Connect NodeMCU with a USB DATA cable. Check its COM number; this setup expects {serial}. Close Serial Monitor before starting the companion.')
        lines+=['Network: Quest and laptop need Internet. ESP data uses USB; matching hotspot Wi-Fi is not required for this transport.']
    else:
        lines+=['Network: laptop and ESP must share the saved 2.4 GHz hotspot/reachable LAN. Quest can use any Internet connection.']
    if not companion.get('alive'):
        fixes.append('Power NodeMCU, close Serial Monitor, and start exactly ONE companion using docs/usb-glove-quickstart.md (USB) or docs/five-finger-hardware.md (Wi-Fi). Do not run both USB and Wi-Fi senders.')
    elif not live_receipt:
        fixes.append('The companion is running but no fresh ESP reply was observed. Check its terminal/log, USB cable and board power (or ESP Wi-Fi/IP if using Wi-Fi). Do not start a duplicate companion. If it has stopped responding, stop that companion before restarting it using the transport guide.')
    board=companion.get('board')
    board_age=companion.get('boardAgeMs')
    if board_age is None or board_age+max(0,(time.monotonic()-companion.get('sampledAt',time.monotonic()))*1000)>=5000:board=None
    if board:
        lines+=['PCA9685: '+('DETECTED' if board['PCA'] else 'NOT DETECTED'),
                'D6 STOP LOOP: '+('CLOSED' if board['STOP_CLOSED'] else 'OPEN - output blocked')]
        if not board['PCA']:fixes.append('Check PCA VCC/common GND and I2C: NodeMCU D1 -> SCL, D2 -> SDA. Recheck PCA detection.')
        if not board['STOP_CLOSED']:fixes.append('Check the D6-to-common-GND stop connection/switch before any output test; an open loop blocks outputs.')
    else:
        lines+=['PCA / D6: not confirmed by a fresh board STATUS reply.']
        if serial and live_receipt:fixes.append('ESP data is replying, but STATUS was not received. Use tools/glove_command.py STATUS with the running USB companion to check PCA and D6.')
    if live_receipt:
        lines+=['','REQUESTS RECEIVED BY ESP (thumb/index/middle/ring/little):',
                '  VIB='+str(receipt['vibration'])+'  RES%='+str(receipt['resistance'])+'  HOLD='+str(receipt['holding']),
                'OUTPUT ARM MASKS: motors='+str(receipt['motorMask'])+' servos='+str(receipt['servoMask']),
                'COMMANDED OUTPUTS: PWM='+str(receipt['pwm'])+'  SERVO_US='+str(receipt['servoUs'])+'  SERVO_SIGNAL_MASK='+str(receipt['servoSignalMask']),
                'Last board stop reason (may be historical): '+receipt['reason']]
        if not receipt['motorMask'] and not receipt['servoMask']:
            lines+=['OUTPUTS: DISARMED. Receiving data does not automatically enable hardware.']
            fixes.append('If preparing an index output test, first verify power, glove off/threads slack and an open VR hand away from objects, then use "Enable Index Feedback.cmd". "Stop Glove.cmd" stops/disarms outputs.')
        else:lines+=['OUTPUTS: ARM mask present. Physical vibration/movement is not measured by this check.']
    ready=working and quest=='LIVE' and live_receipt
    lines+=['','DATA PATH: '+('READY - Quest -> laptop -> ESP is responding' if ready else 'INCOMPLETE - follow the connection steps below'),
            'NEXT STEPS:']
    if not fixes:fixes=['Data paths are responding. Touch then grasp an Orbit object and rerun this command (or use --watch) to observe changing VIB / RES values.']
    for number,fix in enumerate(dict.fromkeys(fixes),1):lines.append(f'{number}. {fix}')
    lines+=['','Rerun: "Check Orbit Foundry.cmd"  |  Live checks: "Check Orbit Foundry.cmd" --watch',
            'A zero request is normal when the hand is away from objects. Rail voltage and actual motor movement are not measured.']
    return '\n'.join(lines)+'\n',ready


def check_once():
    try:settings=vr_link.load_state()
    except (OSError,ValueError):
        return 'AHAM runtime settings could not be read. Run "Open VR Link.cmd" from this folder, then retry.\n',False
    origin=settings.get('origin')
    if origin:validate_external_origin(origin)
    missing={'ok':False,'error':'No saved link'}
    with ThreadPoolExecutor(max_workers=3) as pool:
        public=pool.submit(http_probe,origin+'/api/status') if origin else None
        game=pool.submit(http_probe,origin+'/game.html','game') if origin else None
        inventory=pool.submit(vr_link.process_table)
        local=http_probe('http://127.0.0.1:8890/api/status',timeout=2)
        public=public.result() if public else missing;game=game.result() if game else missing
        try:records=inventory.result();inventory_error=None
        except (OSError,ValueError,RuntimeError,subprocess.SubprocessError):records=[];inventory_error='Unavailable; other checks still shown'
    try:
        from serial.tools.list_ports import comports
        ports=[p.device for p in comports()]
    except (ImportError,OSError):ports=None
    companion=sample_companion(settings,companion_alive(settings,records))
    # Fetch current input AFTER potentially slow public checks. Old data stays old.
    with ThreadPoolExecutor(max_workers=2) as pool:
        preview=pool.submit(http_probe,'http://127.0.0.1:8890/api/wifi-preview',timeout=2)
        connection=pool.submit(http_probe,'http://127.0.0.1:8890/api/connection-status',timeout=2)
        preview=preview.result();connection=connection.result()
    return make_report(settings,local,public,game,preview,connection,companion,ports,inventory_error)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--watch',action='store_true',help='Repeat checks until Ctrl+C; never arm hardware')
    args=parser.parse_args()
    try:
        while True:
            print('Checking the current link, Quest uploads and ESP replies...',flush=True)
            text,ready=check_once();print('\n'+text,flush=True)
            REPORT.write_text(text,encoding='utf-8')
            print('Saved to ORBIT-STATUS.txt.',flush=True)
            if not args.watch:return 0 if ready else 1
            print('Next check in 5 seconds; Ctrl+C to stop.\n',flush=True);time.sleep(5)
    except KeyboardInterrupt:return 0
    except (OSError,ValueError):
        print('Check could not finish. Run "Open VR Link.cmd", verify USB/Internet, and rerun.',flush=True)
        return 1


if __name__=='__main__':raise SystemExit(main())
