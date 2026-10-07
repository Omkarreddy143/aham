"""Protocol v1. See docs/protocol.md; all numeric fields are little-endian."""
from dataclasses import dataclass
import struct

VERSION, TELEMETRY, HAPTIC, CONTROL = 1, 1, 2, 3
DISARM, ARM, CAPTURE_OPEN, CAPTURE_CLOSED, CLEAR_FAULT = range(5)
HEADER = struct.Struct("<BBHI")
TELEMETRY_PAYLOAD = struct.Struct("<BHB5H5HH5BH")
HAPTIC_PAYLOAD = struct.Struct("<H5B5BHB")
MAX_RAW = 64


def crc16(data: bytes) -> int:
    crc = 0xFFFF
    for value in data:
        crc ^= value << 8
        for _ in range(8):
            crc = ((crc << 1) ^ (0x1021 if crc & 0x8000 else 0)) & 0xFFFF
    return crc


def cobs_encode(data: bytes) -> bytes:
    result = bytearray([0])
    code_at, code = 0, 1
    for value in data:
        if value == 0:
            result[code_at] = code
            code_at, code = len(result), 1
            result.append(0)
        else:
            result.append(value)
            code += 1
            if code == 255:
                result[code_at] = code
                code_at, code = len(result), 1
                result.append(0)
    result[code_at] = code
    return bytes(result)


def cobs_decode(data: bytes) -> bytes:
    output = bytearray()
    position = 0
    if not data or 0 in data:
        raise ValueError("Invalid COBS frame")
    while position < len(data):
        code = data[position]
        position += 1
        if position + code - 1 > len(data):
            raise ValueError("Truncated COBS frame")
        output.extend(data[position:position + code - 1])
        position += code - 1
        if code != 255 and position < len(data):
            output.append(0)
    return bytes(output)


@dataclass(frozen=True)
class Packet:
    kind: int
    sequence: int
    time_ms: int
    payload: bytes

    def encode(self) -> bytes:
        raw = HEADER.pack(VERSION, self.kind, self.sequence & 0xFFFF, self.time_ms & 0xFFFFFFFF) + self.payload
        if len(raw) + 2 > MAX_RAW:
            raise ValueError("Packet too large")
        return cobs_encode(raw + struct.pack("<H", crc16(raw))) + b"\0"


def decode(frame: bytes) -> Packet:
    if not frame.endswith(b"\0") or len(frame) > 66:
        raise ValueError("Missing delimiter or oversized frame")
    raw = cobs_decode(frame[:-1])
    if len(raw) < 10 or len(raw) > MAX_RAW:
        raise ValueError("Invalid packet length")
    version, kind, sequence, time_ms = HEADER.unpack(raw[:8])
    if version != VERSION or crc16(raw[:-2]) != struct.unpack("<H", raw[-2:])[0]:
        raise ValueError("Version or CRC mismatch")
    return Packet(kind, sequence, time_ms, raw[8:-2])


class StreamDecoder:
    def __init__(self):
        self.buffer = bytearray()
        self.overflow = False
        self.errors = 0

    def feed(self, data: bytes) -> list[Packet]:
        packets = []
        for value in data:
            if value == 0:
                if self.buffer or self.overflow:
                    try:
                        if self.overflow:
                            raise ValueError("Oversized frame")
                        packets.append(decode(bytes(self.buffer) + b"\0"))
                    except ValueError:
                        self.errors += 1
                self.buffer.clear()
                self.overflow = False
            elif len(self.buffer) >= 65:
                self.overflow = True
            elif not self.overflow:
                self.buffer.append(value)
        return packets


def control(sequence: int, time_ms: int, action: int) -> Packet:
    if action not in range(5):
        raise ValueError("Invalid action")
    return Packet(CONTROL, sequence, time_ms, bytes([action]))


def haptic(sequence: int, time_ms: int, intensities, patterns=None, lease_ms=100) -> Packet:
    if len(intensities) != 5 or not 1 <= lease_ms <= 100:
        raise ValueError("Five channels and a 1–100 ms lease are required")
    patterns = [0] * 5 if patterns is None else patterns
    if len(patterns) != 5 or any(p not in range(4) for p in patterns):
        raise ValueError("Invalid patterns")
    return Packet(HAPTIC, sequence, time_ms, HAPTIC_PAYLOAD.pack(lease_ms, *intensities, *patterns, 0, 0))


def telemetry(packet: Packet) -> dict:
    if packet.kind != TELEMETRY or len(packet.payload) != 33:
        raise ValueError("Not telemetry")
    values = TELEMETRY_PAYLOAD.unpack(packet.payload)
    if values[0] > 3 or any(x > 1000 for x in values[3:8]):
        raise ValueError("Invalid telemetry values")
    capabilities = values[19]
    # Original v1 firmware advertised only bit 0 and had five inputs/outputs.
    legacy = capabilities == 1
    sensor_mask = 31 if legacy else (capabilities >> 2) & 31
    motor_mask = 31 if legacy else (capabilities >> 7) & 31
    return dict(sequence=packet.sequence, time_ms=packet.time_ms, state=values[0], flags=values[1],
                fault=values[2], curls=list(values[3:8]), raw=list(values[8:13]), fsr=values[13],
                vibration=list(values[14:19]), capabilities=capabilities,
                sensor_mask=sensor_mask, motor_mask=motor_mask)
