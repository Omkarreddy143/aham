"""Carry the existing authenticated glove packets over the connected USB cable."""
from pathlib import Path
import re
import serial

COMMAND = re.compile(r'(?:STATUS|STOP|HOME|ARM (?:MOTOR|SERVO|BOTH) (?:THUMB|INDEX|MIDDLE|RING|LITTLE|ALL)|JOG (?:THUMB|INDEX|MIDDLE|RING|LITTLE) [+-](?:10|50|100))\Z')


class SerialPacketLink:
    def __init__(self, port, device=None):
        self.device = device
        if device is None:
            self.device = serial.Serial(port=None, baudrate=115200, timeout=0, write_timeout=.2)
            self.device.dtr = False
            self.device.rts = False
            self.device.port = port
            self.device.open()
        self.buffer = bytearray()

    def send(self, frame):
        if not 2 <= len(frame) <= 66 or frame[-1] != 0:
            raise ValueError('Invalid glove frame')
        self.device.write(b'FRAME ' + frame.hex().encode('ascii') + b'\n')
        return len(frame)

    def send_command(self, command):
        if not COMMAND.fullmatch(command):
            raise ValueError('Unsupported local glove command')
        self.device.write(command.encode('ascii') + b'\n')
        print('LOCAL COMMAND: ' + command, flush=True)

    def recv(self, maximum):
        self.buffer.extend(self.device.read(4096))
        if len(self.buffer) > 8192:
            self.buffer.clear()
            raise BlockingIOError()
        while b'\n' in self.buffer:
            line, _, rest = self.buffer.partition(b'\n')
            self.buffer = bytearray(rest)
            if line.startswith(b'FRAME_ACK '):
                try:
                    frame = bytes.fromhex(line[10:].decode('ascii').strip())
                    if 2 <= len(frame) <= min(66, maximum) and frame[-1] == 0:
                        return frame
                except (ValueError, UnicodeError):
                    pass
            elif line.startswith((b'STATUS ', b'ARMED ', b'NOT ARMED:', b'3 s JOG', b'300 ms JOG', b'DISARMED:', b'I2C FAULT:')):
                print('USB BOARD: ' + line.decode('ascii', errors='replace').strip(), flush=True)
        raise BlockingIOError()

    def close(self):
        self.device.close()


class LocalCommandFile:
    """Only new local lines are acted on; startup never replays an old ARM."""
    def __init__(self, path):
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        self.file = path.open('a+b', buffering=0)
        self.file.seek(0, 2)
        self.buffer = b''

    def poll(self, link):
        self.buffer += self.file.read(4096)
        if len(self.buffer) > 4096:
            self.buffer = b''
            return
        while b'\n' in self.buffer:
            line, _, self.buffer = self.buffer.partition(b'\n')
            try:
                command = line.rstrip(b'\r').decode('ascii')
                if COMMAND.fullmatch(command):
                    link.send_command(command)
            except UnicodeError:
                pass

    def close(self):
        self.file.close()
