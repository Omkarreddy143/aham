import json
from pathlib import Path
import random
import socket
import sys
import threading
import time
import unittest
from urllib.request import Request, urlopen
from urllib.error import HTTPError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "host"))
from aham.protocol import Packet, crc16, cobs_encode, cobs_decode, decode, StreamDecoder, control, haptic, telemetry, TELEMETRY_PAYLOAD
from aham.simulator import SimulatedGlove, create_server
from aham.protocol import IMU_TELEMETRY, IMU_PAYLOAD, imu_telemetry


class ProtocolTests(unittest.TestCase):
    def test_imu_packet_signed_axes_and_invalid_status(self):
        payload = IMU_PAYLOAD.pack(1, -16384, 123, 16384, -32768, 32767, -131)
        data = imu_telemetry(decode(Packet(IMU_TELEMETRY, 9, 10, payload).encode()))
        self.assertEqual(data, dict(valid=True, accel=[-16384, 123, 16384], gyro=[-32768, 32767, -131]))
        self.assertFalse(imu_telemetry(Packet(IMU_TELEMETRY, 0, 0, IMU_PAYLOAD.pack(0, *([0]*6))))['valid'])
        for body in [payload[:-1], bytes([2]) + payload[1:]]:
            with self.assertRaises(ValueError): imu_telemetry(Packet(IMU_TELEMETRY, 0, 0, body))
    def test_active_channel_masks_and_legacy(self):
        for capabilities, sensors, motors in [(1, 31, 31), (8, 2, 0), (265, 2, 2), (4093, 31, 31), (0, 0, 0)]:
            payload = TELEMETRY_PAYLOAD.pack(0, 0, 0, *([0] * 5), *([0] * 5), 0, *([0] * 5), capabilities)
            data = telemetry(decode(Packet(1, 0, 0, payload).encode()))
            self.assertEqual((data['sensor_mask'], data['motor_mask']), (sensors, motors))

    def test_check_vector_and_random_roundtrips(self):
        self.assertEqual(crc16(b"123456789"), 0x29B1)
        rng = random.Random(143)
        for size in range(55):
            payload = bytes(rng.randrange(256) for _ in range(size))
            p = Packet(2, size, 0xFFFFFFFF - size, payload)
            self.assertEqual(decode(p.encode()), p)
        for size in [0, 1, 254, 255, 256, 1024]:
            data = bytes(rng.randrange(256) for _ in range(size))
            self.assertEqual(cobs_decode(cobs_encode(data)), data)

    def test_stream_partial_corrupt_and_overflow_recovery(self):
        good = control(7, 900, 1).encode()
        stream = StreamDecoder()
        self.assertEqual(stream.feed(good[:3]), [])
        self.assertEqual(stream.feed(good[3:])[0].sequence, 7)
        bad = bytearray(good); bad[-2] ^= 1
        recovered = stream.feed(bytes(bad) + b"x" * 100 + b"\0" + good)
        self.assertEqual([p.sequence for p in recovered], [7])
        self.assertEqual(stream.errors, 2)

    def test_fixtures(self):
        for line in (Path(__file__).parent / "fixtures" / "wire.txt").read_text().splitlines():
            kind, seq, stamp, payload, frame = line.split('|')
            packet = decode(bytes.fromhex(frame))
            self.assertEqual(packet, Packet(int(kind), int(seq), int(stamp), bytes.fromhex(payload)))


class SimulatorTests(unittest.TestCase):
    def setUp(self):
        self.glove = SimulatedGlove(command_port=0, telemetry_port=49190)

    def tearDown(self):
        self.glove.close()

    def calibrate(self):
        self.glove.action({"action": "open"})
        self.glove.action({"action": "curls", "values": [1000] * 5})
        self.glove.action({"action": "closed"})
        self.glove.action({"action": "arm"})

    def test_expiry_replay_and_explicit_rearm(self):
        with self.assertRaises(ValueError): self.glove.action({"action": "arm"})
        self.calibrate()
        packet = haptic(10, 0, [255,0,0,0,0])
        self.assertTrue(self.glove.accept(packet, 10))
        self.assertEqual(self.glove.outputs(10)[0], 160)
        self.assertFalse(self.glove.accept(packet, 90))
        self.assertEqual(self.glove.outputs(110), [0] * 5)
        self.glove.tick(160)
        self.assertEqual(self.glove.fault, 2)
        self.assertFalse(self.glove.accept(control(11, 0, 1), 161))

    def test_stop(self):
        self.calibrate()
        self.glove.action({"action": "stop", "value": False})
        self.assertEqual(self.glove.state, 3)
        self.assertEqual(self.glove.snapshot()['vibration'], [0] * 5)

    def test_http_validation_and_state(self):
        server = create_server(self.glove, 0)
        worker = threading.Thread(target=server.serve_forever, daemon=True); worker.start()
        url = f"http://127.0.0.1:{server.server_port}"
        try:
            with urlopen(url + "/api/state") as response:
                self.assertTrue(json.load(response)['simulated'])
            request = Request(url + "/api/action", data=json.dumps({"action":"curls","values":[0,0,-1,0,0]}).encode(), headers={"Content-Type":"application/json"})
            with self.assertRaises(HTTPError) as error: urlopen(request)
            self.assertEqual(error.exception.code, 400)
            error.exception.close()
            request = Request(url + "/api/action", data=b'{"action":"arm"}', headers={"Content-Type":"application/json","Origin":"https://other.example"})
            with self.assertRaises(HTTPError) as error: urlopen(request)
            self.assertEqual(error.exception.code, 403)
            error.exception.close()
        finally:
            server.shutdown(); server.server_close(); worker.join()

    def test_unity_udp_wire_loop(self):
        self.glove.close()
        receiver = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); receiver.bind(("127.0.0.1",0)); receiver.settimeout(1)
        self.glove = SimulatedGlove("unity",0,receiver.getsockname()[1])
        sender = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        target = self.glove.command_socket.getsockname()
        worker = threading.Thread(target=self.glove.run); worker.start()
        def wait_for(predicate):
            limit = time.monotonic()+2
            while not predicate() and time.monotonic()<limit: time.sleep(.01)
            self.assertTrue(predicate())
        try:
            sender.sendto(control(0,0,0).encode(),target)
            sender.sendto(control(1,0,2).encode(),target)
            wait_for(lambda:self.glove.open is not None)
            self.glove.action({"action":"curls","values":[1000]*5})
            sender.sendto(control(2,0,3).encode(),target)
            wait_for(self.glove.calibrated)
            sender.sendto(control(3,0,1).encode(),target)
            sender.sendto(haptic(4,0,[100,0,0,0,0]).encode(),target)
            wait_for(lambda:self.glove.received==1)
            found = False
            for _ in range(30):
                data = telemetry(decode(receiver.recvfrom(256)[0]))
                if data['vibration'][0]==100 and data['curls'][0]==1000: found=True; break
            self.assertTrue(found, 'Unity-format command should produce matching encoded telemetry')
        finally:
            self.glove.done.set(); worker.join(timeout=1); receiver.close(); sender.close()


if __name__ == '__main__': unittest.main()
