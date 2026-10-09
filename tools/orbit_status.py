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
WATCH_INTERVAL = .75
INFRA_INTERVAL = 15


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
        automatic=re.search(r'\bAUTO=(OFF|WAITING_DATA|WAITING_NEUTRAL|ARMING|ACTIVE|BLOCKED)\b',line)
        return dict(sequence=integer('seq',65535),vibration=array('VIB',160),resistance=array('RES%',80),
                    motorMask=integer('M_ARM',31),servoMask=integer('S_ARM',31),pwm=array('PWM',160),
                    servoUs=array('SERVO_US',4095),servoSignalMask=integer('S_SIGNAL',31),
                    holding=holding[1]=='True',reason=reason[1] if reason else 'UNKNOWN',
                    automatic=automatic[1] if automatic else 'OFF')
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


class CompanionTail:
    """Follow new log bytes across watch ticks; never replay startup history."""
    def __init__(self):
        self.path=None;self.identity=None;self.offset=0;self.buffer=b''
        self.receipt=None;self.board=None;self.received_at=None;self.board_at=None
        self.last_status=-float('inf')

    def read(self, settings, alive):
        now=time.monotonic()
        result={'alive':alive,'receipt':None,'board':None,'sampledAt':now}
        path=confined_log(settings)
        if not alive or path is None:return result
        try:
            info=path.stat();identity=(info.st_dev,info.st_ino)
            if path!=self.path or identity!=self.identity:
                self.__init__();self.path=path;self.identity=identity
                self.offset=info.st_size  # Existing receipts are historical.
            elif info.st_size<self.offset:
                self.offset=0;self.buffer=b''
                self.receipt=self.board=None;self.received_at=self.board_at=None
            with path.open('rb') as stream:
                # Bound memory if a watcher was suspended while logs grew.
                if info.st_size-self.offset>65536:
                    self.offset=info.st_size-65536;self.buffer=b''
                    stream.seek(self.offset);stream.readline()
                else:stream.seek(self.offset)
                self.buffer+=stream.read(65536);self.offset=stream.tell()
            # A newly observed line in an old file must not become a fresh reply.
            observed_at=now-max(0,time.time()-info.st_mtime)
            while b'\n' in self.buffer:
                line,_,self.buffer=self.buffer.partition(b'\n')
                text=line.decode('ascii',errors='replace').strip()
                receipt=parse_receipt(text);board=parse_board(text)
                if receipt is not None:self.receipt=receipt;self.received_at=observed_at
                if board is not None:self.board=board;self.board_at=observed_at
            if len(self.buffer)>65536:self.buffer=b''
            control=ROOT / '.build/glove-control.txt'
            if settings.get('gloveSerialPort') and control.is_file() and now-self.last_status>=2:
                with control.open('ab') as output:output.write(b'STATUS\n')
                self.last_status=now
            result.update(receipt=self.receipt,board=self.board,
                receiptAgeMs=None if self.received_at is None else int(max(0,now-self.received_at)*1000),
                boardAgeMs=None if self.board_at is None else int(max(0,now-self.board_at)*1000))
        except OSError:result['error']='Cannot read the running companion log/control file'
        return result


def infrastructure(settings):
    """Slow link/process checks run separately from the live watch display."""
    origin=settings.get('origin')
    if origin:validate_external_origin(origin)
    missing={'ok':False,'error':'No saved link'}
    with ThreadPoolExecutor(max_workers=3) as pool:
        public=pool.submit(http_probe,origin+'/api/status') if origin else None
        game=pool.submit(http_probe,origin+'/game.html','game') if origin else None
        inventory=pool.submit(vr_link.process_table)
        public=public.result() if public else missing;game=game.result() if game else missing
        try:records=inventory.result();error=None
        except (OSError,ValueError,RuntimeError,subprocess.SubprocessError):records=[];error='Unavailable; other checks still shown'
    try:
        from serial.tools.list_ports import comports
        ports=[p.device for p in comports()]
    except (ImportError,OSError):ports=None
    return dict(public=public,game=game,alive=companion_alive(settings,records),
                ports=ports,inventory_error=error,checkedAt=time.monotonic())


class WatchMonitor:
    def __init__(self):
        self.pool=ThreadPoolExecutor(max_workers=1)
        self.future=None;self.future_key=None;self.key=None;self.cached=None
        self.tail=CompanionTail();self.tick=0

    def close(self):
        self.pool.shutdown(wait=False,cancel_futures=True)

    def check(self):
        settings=vr_link.load_state()
        key=tuple(settings.get(k) for k in ('origin','wifiGlovePid','gloveSerialPort','espIp','wifiGloveLog'))
        if key!=self.key:
            self.key=key;self.cached=None;self.tail=CompanionTail()
        if self.future is not None and self.future.done():
            result=self.future.result()
            if self.future_key==key:self.cached=result
            self.future=None
        if self.future is None and (self.cached is None or time.monotonic()-self.cached['checkedAt']>=INFRA_INTERVAL):
            self.future_key=key;self.future=self.pool.submit(infrastructure,dict(settings))
        # Read counters first, then the freshest hand snapshot. Neither waits on
        # Cloudflare or process inventory; do not extend the hardware data lease.
        connection=http_probe('http://127.0.0.1:8890/api/connection-status',timeout=.6)
        preview=http_probe('http://127.0.0.1:8890/api/wifi-preview',timeout=.6)
        cache=self.cached
        age=None if cache is None else time.monotonic()-cache['checkedAt']
        if cache is None or age>=45:
            pending={'ok':False,'error':'Verification in progress'}
            cache=dict(public=pending,game=pending,alive=False,ports=None,inventory_error='Verification in progress')
        companion=self.tail.read(settings,cache['alive'])
        text,ready=make_report(settings,{'ok':preview.get('ok',False)},cache['public'],cache['game'],
            preview,connection,companion,cache['ports'],cache['inventory_error'])
        self.tick+=1
        verification='pending' if age is None else f'{age:.1f}s ago'
        header=f'LIVE WATCH #{self.tick} | {time.strftime("%H:%M:%S")} | refresh ~0.75s | link/ports verified: {verification}\n'
        return header+text,ready


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
        age=receipt_age+max(0,(time.monotonic()-companion.get('sampledAt',time.monotonic()))*1000)
        lines+=['',f'ESP RECEIPT: sequence={receipt["sequence"]} | age={age/1000:.2f}s',
                'REQUESTS RECEIVED BY ESP (thumb/index/middle/ring/little):',
                '  VIB='+str(receipt['vibration'])+'  RES%='+str(receipt['resistance'])+'  HOLD='+str(receipt['holding']),
                'OUTPUT ARM MASKS: motors='+str(receipt['motorMask'])+' servos='+str(receipt['servoMask']),
                'COMMANDED OUTPUTS: PWM='+str(receipt['pwm'])+'  SERVO_US='+str(receipt['servoUs'])+'  SERVO_SIGNAL_MASK='+str(receipt['servoSignalMask']),
                'Last board stop reason (may be historical): '+receipt['reason']]
        automatic=receipt.get('automatic','OFF')
        lines+=['AUTOMATIC FEEDBACK: '+automatic]
        if not receipt['motorMask'] and not receipt['servoMask']:
            if automatic in ('WAITING_DATA','WAITING_NEUTRAL','ARMING'):
                lines+=['OUTPUTS: DISARMED. Automatic mode is waiting for confirmed neutral Quest data.']
            elif automatic=='BLOCKED':
                lines+=['OUTPUTS: DISARMED. Automatic mode was cancelled by a fault or limit.']
            else:
                lines+=['OUTPUTS: DISARMED. Manual mode requires a local ARM command.']
            if automatic in ('WAITING_DATA','WAITING_NEUTRAL','ARMING'):
                fixes.append('Automatic mode is waiting. Use the live Orbit link and keep the right hand clear of objects for two seconds. Fresh neutral cues, PCA/D6 and enabled firmware channels are required. "Stop Glove.cmd" cancels automatic mode.')
            elif automatic=='BLOCKED':
                fixes.append('Automatic mode cancelled after a fault/limit. Check the companion log and correct the cause before using "Automatic VR Feedback.cmd" again. STOP always cancels automatic mode.')
            else:
                fixes.append('For automatic feedback use "Automatic VR Feedback.cmd" with verified power, glove off/threads slack. For manual index feedback use "Enable Index Feedback.cmd". "Stop Glove.cmd" stops/disarms and cancels automatic mode.')
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


def watch_display(report):
    """Keep changing values on screen; the full recovery report stays on disk."""
    lines=report.splitlines();output=[lines[0]]
    groups=(('DATA PATH:', 'QUEST -> LAPTOP:', 'ESP REPLIES:', 'ESP RECEIPT:'),
            ('  VIB=', 'OUTPUT ARM MASKS:', 'COMMANDED OUTPUTS:', 'AUTOMATIC FEEDBACK:', 'OUTPUTS:'),
            ('WORKING QUEST LINK:', 'Last saved link', 'LAPTOP WEBSITE:', 'PUBLIC HTTPS LINK:',
             'ORBIT GAME PAGE:', 'LAPTOP -> ESP TRANSPORT:', 'GLOVE COMPANION:', 'USB PORT:',
             'PCA9685:', 'D6 STOP LOOP:', 'PCA / D6:', 'Uploads accepted/rejected:', 'Last accepted cue:'))
    for prefixes in groups:
        output.append('')
        for prefix in prefixes:
            for line in lines:
                if line.startswith(prefix):
                    if prefix=='COMMANDED OUTPUTS:':
                        pwm,_,servo=line.partition('  SERVO_US=')
                        output.extend((pwm,'  SERVO_US='+servo))
                    else:output.append(line)
    fixes=[line for line in lines if re.match(r'^\d+\. ',line)]
    output+=['','NEXT STEP: '+fixes[0][3:] if fixes else 'NEXT STEP: touch/grasp an object to observe requests.',
             'Full status and recovery steps: ORBIT-STATUS.txt | Ctrl+C to stop.']
    return '\n'.join(output)+'\n'


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--watch',action='store_true',help='Repeat checks until Ctrl+C; never arm hardware')
    args=parser.parse_args()
    monitor=WatchMonitor() if args.watch else None
    try:
        while True:
            started=time.monotonic()
            if monitor:text,ready=monitor.check()
            else:
                print('Checking the current link, Quest uploads and ESP replies...',flush=True)
                text,ready=check_once()
            if monitor and sys.stdout.isatty():
                # Windows Terminal/VS Code support ANSI. Enable it for classic CMD.
                if sys.platform=='win32':
                    import ctypes
                    kernel=ctypes.windll.kernel32;handle=kernel.GetStdHandle(-11)
                    mode=ctypes.c_ulong()
                    if kernel.GetConsoleMode(handle,ctypes.byref(mode)):kernel.SetConsoleMode(handle,mode.value|4)
                print('\x1b[2J\x1b[H',end='')
            print(watch_display(text) if monitor else text,flush=True)
            REPORT.write_text(text,encoding='utf-8')
            if not args.watch:return 0 if ready else 1
            time.sleep(max(0,WATCH_INTERVAL-(time.monotonic()-started)))
    except KeyboardInterrupt:return 0
    except (OSError,ValueError):
        print('Check could not finish. Run "Open VR Link.cmd", verify USB/Internet, and rerun.',flush=True)
        return 1
    finally:
        if monitor:monitor.close()


if __name__=='__main__':raise SystemExit(main())
