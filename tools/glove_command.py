"""Send an explicit local command to the running USB glove companion."""
import argparse
import json
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'host'))
from aham.serial_glove import COMMAND


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', nargs='+')
    args = parser.parse_args()
    command = ' '.join(args.command)
    if not COMMAND.fullmatch(command):
        parser.error('Use STATUS, PCA STATUS, PWM PROBE, STOP, HOME, ARM MOTOR|SERVO|BOTH INDEX, or JOG INDEX +10|+50|+100 [3|10|15 seconds] (negative steps also allowed).')
    try:
        state = json.loads((ROOT / '.build/quest-wireless.json').read_text(encoding='utf-8-sig'))
        if not state.get('gloveSerialPort'):
            raise ValueError('USB companion is not selected. Follow docs/usb-glove-quickstart.md.')
        log = Path(state['wifiGloveLog']).resolve()
        log.relative_to(ROOT / '.build')
        control = ROOT / '.build/glove-control.txt'
        if not control.exists():
            raise ValueError('USB companion has not started its local control file.')
        with log.open('rb') as output:
            output.seek(0, 2)
            with control.open('ab') as destination:
                destination.write((command + '\n').encode('ascii'))
            print('Requested locally: ' + command, flush=True)
            if command == 'PCA STATUS':
                expected = ('PCA DIAG ',)
            elif command == 'PWM PROBE':
                expected = ('PWM PROBE ',)
            else:
                expected = ('ARMED ', 'NOT ARMED:') if command.startswith('ARM ') else ('3 s JOG', '10 s JOG', '15 s JOG', '300 ms JOG', 'JOG needs') if command.startswith('JOG ') else ('STATUS ',) if command == 'STATUS' else ('DISARMED:',)
            deadline = time.monotonic() + 2
            buffer = b''
            while time.monotonic() < deadline:
                buffer += output.read(4096)
                while b'\n' in buffer:
                    line, _, buffer = buffer.partition(b'\n')
                    text = line.decode('utf-8', errors='replace').strip()
                    if text.startswith(tuple('USB BOARD: ' + value for value in expected)):
                        print(text, flush=True)
                        return
                time.sleep(.05)
        print('No board confirmation yet. Check the live feedback terminal; do not assume output enabled.')
    except (OSError, ValueError, KeyError) as error:
        parser.exit(1, str(error) + '\n')


if __name__ == '__main__':
    main()
