"""Manual, one-finger hardware requests without Quest, Unity, or a web server."""
import argparse
from dataclasses import dataclass
from pathlib import Path
from queue import Empty, Queue
import sys
from threading import Thread
import time

from .wifi_bench import HELLO, HELLO_BODY, read_key, signed
from .wifi_glove import BODY, COMMAND, WirelessGlove
from .wifi_monitor import lan_ip, port_number

NAMES = ("THUMB", "INDEX", "MIDDLE", "RING", "LITTLE")
HELP = "Commands: motor INDEX | grip INDEX | zero | status | quit (any named finger)."


@dataclass(frozen=True)
class Request:
    kind: str = "zero"
    finger: int = 0

    def __post_init__(self):
        if self.kind not in {"zero", "motor", "grip"} or type(self.finger) is not int or not 0 <= self.finger < 5:
            raise ValueError("Use zero or one named motor/grip test.")

    @property
    def duration(self):
        return 3.0 if self.kind == "motor" else 2.0 if self.kind == "grip" else 0

    def arrays(self):
        vibration, resistance = [0] * 5, [0] * 5
        if self.kind == "motor":
            vibration[self.finger] = 95
        elif self.kind == "grip":
            resistance[self.finger] = 20
        return vibration, resistance


def parse_command(text):
    parts = text.upper().split()
    if len(parts) == 1 and parts[0] in {"ZERO", "STOP", "STATUS", "QUIT", "HELP"}:
        return "zero" if parts[0] == "STOP" else parts[0].lower()
    if len(parts) == 2 and parts[0] in {"MOTOR", "GRIP"} and parts[1] in NAMES:
        return Request(parts[0].lower(), NAMES.index(parts[1]))
    raise ValueError(HELP)


def test_packet(request, session, boot, sequence, now_ms, key):
    if not 1 <= boot <= 0xffffffff:
        raise ValueError("A fresh ESP boot nonce is required.")
    vibration, resistance = request.arrays()
    flags = 1 if request.kind == "motor" else 2 if request.kind == "grip" else 0
    body = BODY.pack(session, boot, 250, flags, *vibration, *([0] * 5), *resistance)
    return signed(COMMAND, sequence, now_ms, body, key)


class TestGlove(WirelessGlove):
    def send_test(self, request):
        now = time.monotonic()
        self._prune(now)
        if now - self.last_hello >= 1:
            self._send(signed(HELLO, self.sequence, int(now * 1000), HELLO_BODY.pack(self.session), self.key), now)
            self.last_hello = now
        if self.boot:
            packet = test_packet(request, self.session, self.boot, self.sequence, int(now * 1000), self.key)
            self._send(packet, now)
            return packet
        return None


def can_test(request, receipt, now):
    if not receipt or not 0 <= now - receipt["receivedAt"] < .25:
        return False
    bit = 1 << request.finger
    motors, servos = receipt["motorMask"], receipt["servoMask"]
    return receipt["reason"] == "READY" and (
        request.kind == "motor" and motors == bit and servos == 0 or
        request.kind == "grip" and servos == bit and motors == 0)


class TestWindow:
    def __init__(self):
        self.request = Request()
        self.until = 0
        self.next_start = 0

    def start(self, request, receipt, now):
        if now < self.next_start or self.request.kind != "zero" or not can_test(request, receipt, now):
            return False
        self.request = request
        self.until = now + request.duration
        self.next_start = self.until + 1
        return True

    def zero(self):
        self.request = Request()

    def current(self, receipt, now):
        if now >= self.until or self.request.kind != "zero" and not can_test(self.request, receipt, now):
            self.zero()
        return self.request


def read_commands(queue):
    for line in sys.stdin:
        queue.put(line)
    queue.put("quit")


def print_status(receipt):
    if not receipt:
        print("No fresh ESP receipt. Check hotspot, ESP IP, pairing key and UDP 4212.", flush=True)
        return
    print(f"ESP VIB={receipt['vibration']} RES%={receipt['resistance']} "
          f"PWM={receipt['pwm']} SERVO_US={receipt['servoUs']} "
          f"M_ARM={receipt['motorMask']} S_ARM={receipt['servoMask']} "
          f"S_SIGNAL={receipt['servoSignalMask']} {receipt['reason']}", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--esp-ip", type=lan_ip, required=True)
    parser.add_argument("--esp-port", type=port_number, default=4212)
    parser.add_argument("--key-file", type=Path, required=True)
    parser.add_argument("--seconds", type=float, help="Zero requests only, then exit; maximum 30 seconds.")
    args = parser.parse_args()
    if args.seconds is not None and not 0 < args.seconds <= 30:
        parser.error("--seconds must be greater than zero and at most 30; this mode sends zeros only.")
    try:
        key = read_key(args.key_file)
    except ValueError as error:
        parser.error(str(error))
    glove = TestGlove((args.esp_ip, args.esp_port), key)
    window, commands = TestWindow(), Queue()
    print("AHAM WITHOUT VR: starts with zero requests; never sends Serial ARM or edits verification masks.", flush=True)
    print("Detach every finger thread. Confirm supplies/diodes; select one verified circuit in GloveConfig.h.", flush=True)
    print("Serial Monitor: COM port at 115200, newline. ARM MOTOR INDEX or ARM SERVO INDEX; STOP disarms.", flush=True)
    print("motor: duty 95 for 3 seconds. grip: request 20% for 2 seconds; zero pullDeltaUs means no servo movement.", flush=True)
    print("Use Serial JOG INDEX +10/-10 for detached servo checks. Pulse width is microseconds, not degrees.", flush=True)
    print("zero requests release/home but do not disarm. Close with quit; firmware link lease then expires.", flush=True)
    print(HELP, flush=True)
    if args.seconds is None:
        Thread(target=read_commands, args=(commands,), daemon=True).start()
    deadline = time.monotonic() + args.seconds if args.seconds is not None else float("inf")
    last_print, was_testing = 0, False
    try:
        while time.monotonic() < deadline:
            started = time.monotonic()
            try:
                receipt = glove.poll()
            except OSError:
                receipt = None
            try:
                command = parse_command(commands.get_nowait())
            except Empty:
                command = None
            except ValueError as error:
                print(error, flush=True)
                command = None
            if command == "quit":
                break
            if command == "zero":
                window.zero()
                print("Zero requests: motors off, servo home requested. Use Serial STOP to disarm.", flush=True)
            elif command == "status":
                print_status(receipt)
            elif command == "help":
                print(HELP, flush=True)
            elif isinstance(command, Request):
                if window.start(command, receipt, started):
                    print(f"Single {command.kind} request: {NAMES[command.finger]} for {command.duration:g} seconds.", flush=True)
                else:
                    print("Test not started. Need a fresh READY receipt, ONLY that actuator armed, and a one-second pause.", flush=True)
            request = window.current(receipt, time.monotonic())
            if was_testing and request.kind == "zero":
                print("Test finished/cancelled; returning to zero requests.", flush=True)
            was_testing = request.kind != "zero"
            try:
                glove.send_test(request)
            except OSError:
                window.zero()
            if started - last_print >= 1:
                last_print = started
                print_status(receipt)
            time.sleep(max(0, .05 - (time.monotonic() - started)))
    except KeyboardInterrupt:
        pass
    finally:
        glove.close()
    print("Tester closed; zero packets requested, then the ESP lease expires. Disconnect power for physical isolation.", flush=True)


if __name__ == "__main__":
    main()
