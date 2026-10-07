"""Forward WebXR preview data to an ESP8266 over LAN UDP; no actuator packets."""
import argparse
from collections import OrderedDict
import ipaddress
import json
import secrets
import socket
import struct
import time
from urllib.error import URLError
from urllib.request import HTTPRedirectHandler, ProxyHandler, build_opener

from .protocol import Packet, crc16, decode

PREVIEW, RECEIPT = 5, 6
BODY = struct.Struct("<IHB5B5B5B5B")
ACK = struct.Struct("<IHBB")
ZERO = [0]*5


def channels(value, maximum):
    if (not isinstance(value, list) or len(value) != 5
            or any(type(item) is not int or not 0 <= item <= maximum for item in value)):
        raise ValueError("Invalid preview channels")
    return list(value)


def fresh(value, maximum, elapsed):
    return (isinstance(value, dict) and type(value.get("ageMs")) is int
            and 0 <= value["ageMs"] + elapsed*1000 < maximum)


def preview_packet(snapshot, session, sequence, now_ms, elapsed=0):
    """Fail closed independently for cue/grip; stale network snapshots are zeros."""
    if type(session) is not int or not 1 <= session <= 0xffffffff:
        raise ValueError("A nonzero session ID is required")
    flags, vibration, patterns, resistance, reference = 0, ZERO, ZERO, ZERO, ZERO
    if isinstance(snapshot, dict) and snapshot.get("mode") == "monitor-only" and elapsed >= 0:
        cue, grip = snapshot.get("cue"), snapshot.get("grip")
        if (fresh(cue, 250, elapsed) and cue.get("source") == "webxr"
                and cue.get("hand") == "right" and cue.get("trackingValid") is True):
            try:
                vibration, patterns = channels(cue.get("duties"), 160), channels(cue.get("patterns"), 3)
                flags |= 1
            except ValueError:
                vibration, patterns = ZERO, ZERO
        if (fresh(grip, 500, elapsed) and grip.get("source") == "webxr"
                and grip.get("hand") == "right" and grip.get("trackingValid") is True
                and grip.get("holding") is True and grip.get("actuatorsEnabled") is False
                and grip.get("objectId") in ("mint", "amber", "violet")
                and grip.get("gripMode") in ("pinch", "grip")):
            try:
                resistance, reference = channels(grip.get("resistance"), 80), channels(grip.get("referenceCurl"), 100)
                flags |= 2
            except ValueError:
                resistance, reference = ZERO, ZERO
    payload = BODY.pack(session, 250, flags, *vibration, *patterns, *resistance, *reference)
    return Packet(PREVIEW, sequence, now_ms, payload)


def preview_values(packet):
    if packet.kind != PREVIEW or len(packet.payload) != BODY.size:
        raise ValueError("Not a Wi-Fi preview")
    values = BODY.unpack(packet.payload)
    if not values[0] or not 100 <= values[1] <= 250 or values[2] > 3:
        raise ValueError("Invalid Wi-Fi preview header")
    result = dict(session=values[0], leaseMs=values[1], flags=values[2],
                  vibration=channels(list(values[3:8]), 160), patterns=channels(list(values[8:13]), 3),
                  resistance=channels(list(values[13:18]), 80), referenceCurl=channels(list(values[18:23]), 100))
    if (not result["flags"] & 1 and any(result["vibration"]+result["patterns"])
            or not result["flags"] & 2 and any(result["resistance"]+result["referenceCurl"])):
        raise ValueError("Inactive preview channels must be zero")
    return result


class WirelessMonitor:
    def __init__(self, address, session=None):
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.socket.connect(address)  # OS filters receipts to this ESP's IP and port.
        self.socket.setblocking(False)
        self.session = session or secrets.randbits(32) or 1
        self.sequence = 0
        self.pending = OrderedDict()
        self.last_receipt = None
        self.sent = self.received = 0

    def send(self, snapshot, elapsed=0):
        now = time.monotonic()
        packet = preview_packet(snapshot, self.session, self.sequence, int(now*1000), elapsed)
        self.socket.send(packet.encode())
        self.pending[self.sequence] = (now, packet)
        self.sequence = (self.sequence+1) & 0xffff
        self.sent += 1
        self._prune(now)
        return packet

    def _prune(self, now):
        while self.pending and (len(self.pending)>32 or now-next(iter(self.pending.values()))[0]>=.5):
            self.pending.popitem(last=False)

    def poll(self):
        now = time.monotonic()
        self._prune(now)
        for _ in range(16):
            try:
                frame = self.socket.recv(128)
            except (BlockingIOError, ConnectionResetError):
                break
            try:
                ack = decode(frame)
                if ack.kind != RECEIPT or len(ack.payload) != ACK.size:
                    continue
                session, checksum, motor_mask, servo_enabled = ACK.unpack(ack.payload)
                pending = self.pending.get(ack.sequence)
                if (session != self.session or motor_mask or servo_enabled or pending is None
                        or checksum != crc16(pending[1].payload)):
                    continue
                values = preview_values(pending[1])
            except ValueError:
                continue
            self.pending.pop(ack.sequence)
            self.received += 1
            self.last_receipt = dict(values, sequence=ack.sequence, receivedAt=now, actuatorsEnabled=False)
        return self.last_receipt if self.last_receipt and now-self.last_receipt["receivedAt"]<.5 else None

    def close(self):
        try:
            for _ in range(3):
                self.send(None)
        except OSError:
            pass
        finally:
            self.socket.close()


def lan_ip(value):
    try:
        address = ipaddress.IPv4Address(value)
        if (not address.is_private or address.is_loopback or address.is_unspecified
                or address.is_multicast or address.is_reserved or value != str(address)):
            raise ValueError()
    except ValueError:
        raise argparse.ArgumentTypeError("Use the ESP's private LAN IPv4 address from its Serial Monitor") from None
    return str(address)


def port_number(value):
    try:
        port = int(value)
        if not 1 <= port <= 65535:
            raise ValueError()
    except ValueError:
        raise argparse.ArgumentTypeError("Port must be 1..65535") from None
    return port


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--esp-ip", type=lan_ip, required=True)
    parser.add_argument("--esp-port", type=port_number, default=4210)
    parser.add_argument("--relay-port", type=port_number, default=8890)
    args = parser.parse_args()
    monitor = WirelessMonitor((args.esp_ip, args.esp_port))
    opener = build_opener(ProxyHandler({}), NoRedirect())
    url = f"http://127.0.0.1:{args.relay_port}/api/wifi-preview"
    print(f"AHAM receive-only Wi-Fi: laptop {monitor.socket.getsockname()[0]} -> ESP {args.esp_ip}:{args.esp_port}", flush=True)
    print("USB is for power/logs only. Motor and servo output OFF. Channel order: thumb/index/middle/ring/little.", flush=True)
    last_print = 0
    try:
        while True:
            started = time.monotonic()
            snapshot = None
            try:
                with opener.open(url, timeout=.15) as response:
                    body = response.read(8193)
                    if len(body)>8192:
                        raise ValueError("Oversized preview")
                    snapshot = json.loads(body)
            except (OSError, URLError, ValueError, RecursionError):
                pass  # Send zeros, never keep an old hold alive after relay loss.
            try:
                monitor.send(snapshot, time.monotonic()-started)
            except OSError:
                pass
            receipt = monitor.poll()
            now = time.monotonic()
            if now-last_print>=1:
                last_print=now
                if receipt:
                    print(f"ESP RECEIVED seq={receipt['sequence']} VIB={receipt['vibration']} RES%={receipt['resistance']} "
                          f"HOLD={bool(receipt['flags'] & 2)} OUTPUT=OFF", flush=True)
                else:
                    print("NO FRESH ESP RECEIPT: check ESP_IP, laptop IP, hotspot client isolation and uploaded Wi-Fi environment.", flush=True)
                if snapshot is None:
                    print("Local WebXR relay unavailable/outdated; sending zero preview.", flush=True)
            time.sleep(max(0, .05-(time.monotonic()-started)))
    except KeyboardInterrupt:
        pass
    finally:
        monitor.close()


if __name__ == "__main__":
    main()
