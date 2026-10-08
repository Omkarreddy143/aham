"""Explicit user-confirmed detached test of five servos, sequentially."""
from pathlib import Path
import argparse
import sys
import time

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / 'host'))
from aham.glove_test import TestGlove, Request, can_test, print_status, NAMES
from aham.wifi_bench import read_key
from aham.serial_glove import SerialPacketLink

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--serial-port', required=True)
parser.add_argument('--key-file', type=Path, required=True)
parser.add_argument('--finger', choices=(*NAMES, 'ALL'), default='INDEX')
parser.add_argument('--detached', action='store_true', required=True, help='Confirm glove off hand and every tendon detached')
args = parser.parse_args()
glove = TestGlove(('127.0.0.1', 9), read_key(args.key_file))
glove.socket.close()
glove.socket = SerialPacketLink(args.serial_port)
receipt = None

def exchange():
    global receipt
    glove.send_test(Request())
    incoming = glove.poll()
    if incoming is not None:
        receipt = incoming
    return incoming

def pump(seconds):
    until = time.monotonic() + seconds
    while time.monotonic() < until:
        exchange()
        time.sleep(.025)

try:
    print('DETACHED BENCH: selected servos one at a time; each 10 seconds, center +/-250 us, clamped 1250..1750 us. All motors OFF.', flush=True)
    pump(1.5)
    for finger, name in enumerate(NAMES):
        if args.finger != 'ALL' and name != args.finger:
            continue
        bit = 1 << finger
        print(f'WATCH {name}: PCA servo channel {finger}.', flush=True)
        glove.socket.send_command('STATUS')
        glove.socket.send_command(f'ARM SERVO {name}')
        pump(.3)
        if not can_test(Request('grip', finger), receipt, time.monotonic()):
            raise RuntimeError(f'{name}: no fresh READY receipt with only this servo armed')
        center = receipt['servoUs'][finger]
        if not 1400 <= center <= 1600:
            raise RuntimeError(f'{name}: invalid center; stopping batch')
        upper, lower = min(1750, center + 250), max(1250, center - 250)
        print(f'{name} requested positions: {center} -> {upper} -> {lower} -> {center} us.', flush=True)
        glove.socket.send_command(f'SWEEP {name}')
        if name == 'INDEX':
            glove.socket.send_command('PCA STATUS')
        started = time.monotonic()
        samples = {upper: [], lower: []}
        next_print = started
        while time.monotonic() - started < 10.6:
            incoming = exchange()
            now = time.monotonic()
            if not receipt or now - receipt['receivedAt'] >= .25:
                raise RuntimeError(f'{name}: feedback link became stale; stopping batch')
            if incoming is not None:
                if incoming['motorMask'] or any(incoming['pwm']) or incoming['servoSignalMask'] & ~bit:
                    raise RuntimeError(f'{name}: unexpected other active actuator; stopping batch')
                if incoming['servoSignalMask'] & bit:
                    pulse = incoming['servoUs'][finger]
                    if not 1250 <= pulse <= 1750:
                        raise RuntimeError(f'{name}: out-of-range pulse; stopping batch')
                    if pulse in samples:
                        samples[pulse].append(now)
                if .3 < now - started < 9.85 and incoming['servoMask'] != bit:
                    raise RuntimeError(f'{name}: servo disarmed early; stopping batch')
            if now >= next_print:
                print_status(receipt)
                next_print = now + 1
            time.sleep(.025)
        for target, times in samples.items():
            span = times[-1] - times[0] if times else 0
            if span < 2.4:
                raise RuntimeError(f'{name}: {target} us target not confirmed long enough ({span:.2f}s)')
        if receipt['servoMask'] or receipt['motorMask'] or receipt['servoSignalMask']:
            raise RuntimeError(f'{name}: automatic shutdown not confirmed')
        print(f'{name}: both {upper} and {lower} us targets confirmed, returned home and switched OFF. Physical observation required.', flush=True)
        glove.socket.send_command('STOP')
        pump(.35)
    print('SELECTED COMMAND TESTS COMPLETE. Physical movement must be reported by the user.', flush=True)
finally:
    try:
        glove.socket.send_command('STOP')
        pump(.4)
    finally:
        glove.close()
