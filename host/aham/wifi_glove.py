"""Forward five WebXR channels to a locally armed, PCA9685-based ESP8266 bench glove."""
import argparse
import json
from pathlib import Path
import struct
import threading
import time
from urllib.error import URLError
from urllib.request import ProxyHandler, build_opener

from .protocol import crc16, decode
from .auto_feedback import AutoFeedback
from .wifi_monitor import NoRedirect, fresh, lan_ip, port_number, preview_packet, preview_values
from .wifi_bench import (HELLO, HELLO_BODY, HELLO_ACK, HELLO_RECEIPT, REASONS, WirelessBench,
                        authenticated, read_key, signed)

COMMAND, RECEIPT = 11, 12
BODY = struct.Struct("<IIHB5B5B5B")
ACK = struct.Struct("<IIHBB5B5HBB")
USB_RETRY_SECONDS = .5


class USBRecovery:
    """Reopen a lost USB handle without replaying local arming commands."""
    def __init__(self, port, link_factory, emit=None):
        self.port, self.link_factory = port, link_factory
        self.emit = emit or (lambda value: print(value, flush=True))
        self.retry_at = None

    def failed(self, glove, automatic, control, now):
        if self.retry_at is not None:
            return
        automatic.cancel('USB disconnected; restart automatic feedback locally after reconnection')
        glove.boot = 0
        glove.last_receipt = None
        glove.pending.clear()
        glove.last_hello = -10.0
        try:
            glove.socket.close()
        except OSError:
            pass
        if control:
            control.discard_pending()
        self.retry_at = now + USB_RETRY_SECONDS
        self.emit(f'USB DISCONNECTED: retrying {self.port}; outputs remain disarmed.')

    def ready(self, glove, control, now):
        if self.retry_at is None:
            return True
        if now < self.retry_at:
            return False
        link = None
        try:
            link = self.link_factory(self.port)
            # STOP precedes any authenticated handshake or local control polling.
            link.send_command('STOP')
        except OSError:
            if link is not None:
                try:
                    link.close()
                except OSError:
                    pass
            self.retry_at = now + USB_RETRY_SECONDS
            return False
        if control:
            control.discard_pending()
        glove.socket = link
        self.retry_at = None
        self.emit(f'USB RECONNECTED: {self.port}; STOP sent, automatic feedback is OFF.')
        return True


def valid_servo_receipt(sent, motors, servos, signal, pwm, pulses, reason):
    if all(1400 <= value <= 1600 for value in pulses):
        return True
    # A local detached sweep is the only wider output. VR command ranges remain unchanged.
    return (not any(sent[3:]) and motors == 0 and not any(pwm)
            and servos in (1, 2, 4, 8, 16) and signal == servos and reason == 1
            and all((1250 <= value <= 1750) if servos & (1 << i)
                    else (1400 <= value <= 1600) for i, value in enumerate(pulses)))


class PreviewReader:
    """Poll HTTP separately so a slow response cannot stop the UDP heartbeat."""
    def __init__(self, url):
        self.url = url
        self.opener = build_opener(ProxyHandler({}), NoRedirect())
        self.lock = threading.Lock()
        self.done = threading.Event()
        self.snapshot = None
        self.sampled_at = time.monotonic()
        self.worker = threading.Thread(target=self._run, name="AHAM-preview-reader", daemon=True)

    def start(self):
        self.worker.start()

    def _sample(self):
        started = time.monotonic()
        value = None
        try:
            with self.opener.open(self.url, timeout=.15) as response:
                body = response.read(8193)
                if len(body) > 8192:
                    raise ValueError("Oversized preview")
                value = json.loads(body)
        except (OSError, URLError, ValueError, RecursionError):
            pass
        with self.lock:
            self.snapshot, self.sampled_at = value, started

    def _run(self):
        while not self.done.is_set():
            started = time.monotonic()
            self._sample()
            self.done.wait(max(0, .05-(time.monotonic()-started)))

    def get(self):
        with self.lock:
            return self.snapshot, max(0, time.monotonic()-self.sampled_at)

    def close(self):
        self.done.set()
        self.worker.join(timeout=.3)


def command_packet(snapshot, session, boot, sequence, now_ms, key, elapsed=0):
    if not 1 <= boot <= 0xffffffff:
        raise ValueError("A fresh ESP boot nonce is required")
    if isinstance(snapshot, dict) and not fresh(snapshot.get("grip"), 250, elapsed):
        snapshot = dict(snapshot, grip=None)
    value = preview_values(preview_packet(snapshot, session, sequence, now_ms, elapsed))
    body = BODY.pack(session, boot, 250, value["flags"], *value["vibration"], *value["patterns"], *value["resistance"])
    return signed(COMMAND, sequence, now_ms, body, key)


def quest_input_status(snapshot, elapsed=0):
    """Describe the current source separately from an ESP's saved disarm reason."""
    if snapshot is None:
        return "RELAY_UNAVAILABLE"
    if not isinstance(snapshot, dict) or snapshot.get("mode") != "monitor-only":
        return "INVALID_PREVIEW"
    values = [snapshot.get("cue"), snapshot.get("grip")]
    if not any(isinstance(value, dict) for value in values):
        return "WAITING_FOR_VR"
    current = [value for value in values if fresh(value, 250, elapsed)]
    if not current:
        return "STALE_VR_DATA"
    if any(value.get("source") == "webxr" and value.get("hand") == "right"
           and value.get("trackingValid") is True for value in current):
        return "RIGHT_HAND_TRACKING"
    return "NO_RIGHT_HAND_TRACKING"


class WirelessGlove(WirelessBench):
    def send(self, snapshot, elapsed=0):
        now = time.monotonic(); self._prune(now)
        if now-self.last_hello >= 1:
            self._send(signed(HELLO, self.sequence, int(now*1000), HELLO_BODY.pack(self.session), self.key), now)
            self.last_hello = now
        if self.boot:
            packet = command_packet(snapshot, self.session, self.boot, self.sequence, int(now*1000), self.key, elapsed)
            self._send(packet, now)
            return packet
        return None

    def poll(self):
        now = time.monotonic(); self._prune(now)
        for _ in range(16):
            try:
                frame = self.socket.recv(128)
            except (BlockingIOError, ConnectionResetError):
                break
            try:
                ack = decode(frame); pending = self.pending.get(ack.sequence)
                if pending is None:
                    continue
                packet = pending[1]
                if ack.kind == HELLO_RECEIPT and packet.kind == HELLO:
                    session, boot = HELLO_ACK.unpack(authenticated(ack, HELLO_ACK.size, self.key))
                    if session != self.session or not boot:
                        continue
                    if boot != self.boot:
                        self.boot = boot; self.last_receipt = None; self.pending.clear()
                    else:
                        self.pending.pop(ack.sequence)
                    continue
                if ack.kind != RECEIPT or packet.kind != COMMAND:
                    continue
                result = ACK.unpack(authenticated(ack, ACK.size, self.key))
                session, boot, checksum, motor_mask, servo_mask = result[:5]
                pwm, pulse, signal_mask, reason = list(result[5:10]), list(result[10:15]), result[15], result[16]
                sent = BODY.unpack(packet.payload[:BODY.size])
                if (session != self.session or boot != self.boot or checksum != crc16(packet.payload[:BODY.size])
                        or motor_mask > 31 or servo_mask > 31 or signal_mask > 31 or reason >= len(REASONS)
                        or any(value > 160 for value in pwm)
                        or not valid_servo_receipt(sent, motor_mask, servo_mask, signal_mask, pwm, pulse, reason)
                        or any(pwm[i] and not motor_mask & (1 << i) for i in range(5))):
                    continue
                if self.last_receipt:
                    advance = (ack.sequence-self.last_receipt["sequence"]) & 0xffff
                    if not 0 < advance < 0x8000:
                        continue
            except (ValueError, struct.error):
                continue
            self.pending.pop(ack.sequence); self.received += 1
            self.last_receipt = dict(sequence=ack.sequence, receivedAt=now, vibration=list(sent[4:9]),
                resistance=list(sent[14:19]), holding=bool(sent[3] & 2), motorMask=motor_mask,
                servoMask=servo_mask, pwm=pwm, servoUs=pulse, servoSignalMask=signal_mask, reason=REASONS[reason])
        return self.last_receipt if self.last_receipt and now-self.last_receipt["receivedAt"] < .5 else None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    transport = parser.add_mutually_exclusive_group(required=True)
    transport.add_argument("--esp-ip", type=lan_ip)
    transport.add_argument("--serial-port", help="USB fallback for the same five-finger firmware, at 115200")
    parser.add_argument("--control-file", type=Path, help="Append local STATUS/ARM/JOG/STOP commands; old lines are skipped")
    parser.add_argument("--esp-port", type=port_number, default=4212)
    parser.add_argument("--relay-port", type=port_number, default=8890)
    parser.add_argument("--key-file", type=Path, required=True)
    parser.add_argument("--auto-arm", choices=('INDEX','ALL'), help="Enable automatic USB feedback; starts waiting for neutral Quest data")
    args = parser.parse_args()
    if args.auto_arm and not args.serial_port:
        parser.error('--auto-arm requires the USB transport for local ARM/STOP commands')
    try:
        key = read_key(args.key_file)
    except ValueError as error:
        parser.error(str(error))
    control = recovery = None
    if args.serial_port:
        from .serial_glove import SerialPacketLink, LocalCommandFile
        glove = WirelessGlove(("127.0.0.1", 9), key)
        glove.socket.close()
        glove.socket = SerialPacketLink(args.serial_port)
        recovery = USBRecovery(args.serial_port, SerialPacketLink)
        if args.control_file:
            control = LocalCommandFile(args.control_file)
        print(f"ESP TRANSPORT=USB PORT={args.serial_port} BAUD=115200; Quest stays wireless.", flush=True)
    else:
        if args.control_file:
            parser.error("--control-file requires --serial-port")
        glove = WirelessGlove((args.esp_ip, args.esp_port), key)
    url = f"http://127.0.0.1:{args.relay_port}/api/wifi-preview"
    preview = PreviewReader(url)
    preview.start()
    automatic = AutoFeedback()
    if args.auto_arm:
        for command in automatic.local_commands('AUTO ARM BOTH ' + args.auto_arm):
            glove.socket.send_command(command)
    print("AHAM FIVE-FINGER BENCH: T/I/M/R/L; PCA servo 0..4, motor SIGNAL 8..12. ESP boots DISARMED.", flush=True)
    print("Use verified circuits, detached tendons, suitable supplies and local Serial ARM commands at 115200 baud.", flush=True)
    print("PWM/SERVO_US are commanded outputs, not measured motion or force. STOP parks/disarms.", flush=True)
    last_print = 0
    try:
        while True:
            started = time.monotonic()
            if recovery and not recovery.ready(glove, control, started):
                time.sleep(.05)
                continue
            snapshot, elapsed = preview.get()
            try:
                if control:
                    control.poll(glove.socket, automatic.local_commands)
                glove.send(snapshot, elapsed); receipt = glove.poll()
            except OSError:
                receipt = None
                if recovery:
                    recovery.failed(glove, automatic, control, time.monotonic())
            now = time.monotonic()
            if args.serial_port and recovery.retry_at is None:
                commands = automatic.step(snapshot, elapsed + now-started, receipt,
                                          glove.socket.board_status, glove.boot, now)
                try:
                    for command in commands:
                        glove.socket.send_command(command)
                except OSError:
                    receipt = None
                    recovery.failed(glove, automatic, control, time.monotonic())
            if now-last_print >= .5:
                last_print = now
                if receipt:
                    source_status = quest_input_status(snapshot, elapsed + now-started)
                    print(f"ESP FIVE seq={receipt['sequence']} ESP_LINK=LIVE QUEST={source_status} "
                          f"VIB={receipt['vibration']} RES%={receipt['resistance']} "
                          f"HOLD={receipt['holding']} M_ARM={receipt['motorMask']} S_ARM={receipt['servoMask']} "
                          f"PWM={receipt['pwm']} SERVO_US={receipt['servoUs']} "
                          f"S_SIGNAL={receipt['servoSignalMask']} LAST_REASON={receipt['reason']} AUTO={automatic.phase}", flush=True)
                else:
                    if args.serial_port:
                        print(f"NO FRESH FIVE-FINGER RECEIPT: check USB data cable, board power and {args.serial_port}; close Serial Monitor.", flush=True)
                    else:
                        print("NO FRESH FIVE-FINGER RECEIPT: check nodemcu_wifi_glove, UDP 4212, IPs and pairing key.", flush=True)
                if snapshot is None:
                    print("Relay unavailable: sending zeros.", flush=True)
            interval = .05 if args.serial_port else .02
            time.sleep(max(0, interval-(time.monotonic()-started)))
    except KeyboardInterrupt:
        pass
    finally:
        if args.serial_port:
            try:glove.socket.send_command('STOP')
            except OSError:pass
        preview.close()
        if control:
            control.close()
        glove.close()


if __name__ == "__main__":
    main()
