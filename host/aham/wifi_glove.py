"""Forward five WebXR channels to a locally armed, PCA9685-based ESP8266 bench glove."""
import argparse
import json
from pathlib import Path
import struct
import time
from urllib.error import URLError
from urllib.request import ProxyHandler, build_opener

from .protocol import crc16, decode
from .wifi_monitor import NoRedirect, fresh, lan_ip, port_number, preview_packet, preview_values
from .wifi_bench import (HELLO, HELLO_BODY, HELLO_ACK, HELLO_RECEIPT, REASONS, WirelessBench,
                        authenticated, read_key, signed)

COMMAND, RECEIPT = 11, 12
BODY = struct.Struct("<IIHB5B5B5B")
ACK = struct.Struct("<IIHBB5B5HBB")


def command_packet(snapshot, session, boot, sequence, now_ms, key, elapsed=0):
    if not 1 <= boot <= 0xffffffff:
        raise ValueError("A fresh ESP boot nonce is required")
    if isinstance(snapshot, dict) and not fresh(snapshot.get("grip"), 250, elapsed):
        snapshot = dict(snapshot, grip=None)
    value = preview_values(preview_packet(snapshot, session, sequence, now_ms, elapsed))
    body = BODY.pack(session, boot, 250, value["flags"], *value["vibration"], *value["patterns"], *value["resistance"])
    return signed(COMMAND, sequence, now_ms, body, key)


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
                if (session != self.session or boot != self.boot or checksum != crc16(packet.payload[:BODY.size])
                        or motor_mask > 31 or servo_mask > 31 or signal_mask > 31 or reason >= len(REASONS)
                        or any(value > 160 for value in pwm) or any(not 1400 <= value <= 1600 for value in pulse)
                        or any(pwm[i] and not motor_mask & (1 << i) for i in range(5))):
                    continue
                if self.last_receipt:
                    advance = (ack.sequence-self.last_receipt["sequence"]) & 0xffff
                    if not 0 < advance < 0x8000:
                        continue
                sent = BODY.unpack(packet.payload[:BODY.size])
            except (ValueError, struct.error):
                continue
            self.pending.pop(ack.sequence); self.received += 1
            self.last_receipt = dict(sequence=ack.sequence, receivedAt=now, vibration=list(sent[4:9]),
                resistance=list(sent[14:19]), holding=bool(sent[3] & 2), motorMask=motor_mask,
                servoMask=servo_mask, pwm=pwm, servoUs=pulse, servoSignalMask=signal_mask, reason=REASONS[reason])
        return self.last_receipt if self.last_receipt and now-self.last_receipt["receivedAt"] < .5 else None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--esp-ip", type=lan_ip, required=True)
    parser.add_argument("--esp-port", type=port_number, default=4212)
    parser.add_argument("--relay-port", type=port_number, default=8890)
    parser.add_argument("--key-file", type=Path, required=True)
    args = parser.parse_args()
    try:
        key = read_key(args.key_file)
    except ValueError as error:
        parser.error(str(error))
    glove = WirelessGlove((args.esp_ip, args.esp_port), key)
    opener = build_opener(ProxyHandler({}), NoRedirect())
    url = f"http://127.0.0.1:{args.relay_port}/api/wifi-preview"
    print("AHAM FIVE-FINGER BENCH: T/I/M/R/L; PCA servo 0..4, motor SIGNAL 8..12. ESP boots DISARMED.", flush=True)
    print("Use verified circuits, detached tendons, suitable supplies and local Serial ARM commands at 115200 baud.", flush=True)
    print("PWM/SERVO_US are commanded outputs, not measured motion or force. STOP parks/disarms.", flush=True)
    last_print = 0
    try:
        while True:
            started = time.monotonic(); snapshot = None
            try:
                with opener.open(url, timeout=.15) as response:
                    body = response.read(8193)
                    if len(body) > 8192:
                        raise ValueError("Oversized preview")
                    snapshot = json.loads(body)
            except (OSError, URLError, ValueError, RecursionError):
                pass
            try:
                glove.send(snapshot, time.monotonic()-started); receipt = glove.poll()
            except OSError:
                receipt = None
            now = time.monotonic()
            if now-last_print >= .5:
                last_print = now
                if receipt:
                    print(f"ESP FIVE seq={receipt['sequence']} VIB={receipt['vibration']} RES%={receipt['resistance']} "
                          f"HOLD={receipt['holding']} M_ARM={receipt['motorMask']} S_ARM={receipt['servoMask']} "
                          f"PWM={receipt['pwm']} SERVO_US={receipt['servoUs']} "
                          f"S_SIGNAL={receipt['servoSignalMask']} {receipt['reason']}", flush=True)
                else:
                    print("NO FRESH FIVE-FINGER RECEIPT: check nodemcu_wifi_glove, UDP 4212, IPs and pairing key.", flush=True)
                if snapshot is None:
                    print("Relay unavailable: sending zeros.", flush=True)
            time.sleep(max(0, .05-(time.monotonic()-started)))
    except KeyboardInterrupt:
        pass
    finally:
        glove.close()


if __name__ == "__main__":
    main()
