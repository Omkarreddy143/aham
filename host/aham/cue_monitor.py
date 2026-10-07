"""Observe Unity cue packets on localhost. This module has no serial/output route."""
import socket
from .protocol import decode, HAPTIC, HAPTIC_PAYLOAD


def cue_values(packet):
    if packet.kind != HAPTIC or len(packet.payload) != HAPTIC_PAYLOAD.size:
        raise ValueError("Not a cue")
    fields = HAPTIC_PAYLOAD.unpack(packet.payload)
    if not 1 <= fields[0] <= 100 or any(n > 160 for n in fields[1:6]) or any(n > 3 for n in fields[6:11]) or fields[11] or fields[12]:
        raise ValueError("Invalid monitor cue")
    return dict(duties=list(fields[1:6]), patterns=list(fields[6:11]))


class CueMonitor:
    def __init__(self, port=8767):
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.socket.bind(("127.0.0.1", port))
        self.socket.setblocking(False)
        self.latest = None
        self.count = 0

    def poll(self):
        packets = []
        for _ in range(16):
            try:
                frame, sender = self.socket.recvfrom(256)
            except BlockingIOError:
                break
            if sender[0] != "127.0.0.1":
                continue
            try:
                packet = decode(frame)
                self.latest = cue_values(packet)
                self.count += 1
                packets.append(packet)
            except ValueError:
                pass
        return packets

    def close(self):
        self.socket.close()
