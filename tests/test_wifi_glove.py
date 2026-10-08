"""Five independent channels, HMAC, source freshness and real mock UDP receipts."""
from pathlib import Path
import socket
import sys
import time
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "host"))
from aham.protocol import Packet, crc16, decode
from aham.wifi_bench import HELLO, HELLO_ACK, HELLO_RECEIPT, authenticated, signed
from aham.wifi_glove import ACK, BODY, COMMAND, RECEIPT, WirelessGlove, PreviewReader, command_packet, quest_input_status
from test_wifi_monitor import snapshot

KEY = bytes(range(32))  # Public test vector, not a deployment key.


class PreviewReaderTests(unittest.TestCase):
    def test_cached_data_keeps_http_and_cache_delay_in_freshness(self):
        reader = PreviewReader('http://127.0.0.1/unused')
        response = MagicMock()
        response.read.return_value = __import__('json').dumps(snapshot()).encode()
        reader.opener = MagicMock()
        reader.opener.open.return_value.__enter__.return_value = response
        with patch('aham.wifi_glove.time.monotonic', side_effect=[10, 10.3]):
            reader._sample()
            value, elapsed = reader.get()
        self.assertAlmostEqual(elapsed, .3)
        body = BODY.unpack(command_packet(value, 1, 2, 3, 4, KEY, elapsed).payload[:BODY.size])
        self.assertEqual(body[3:], (0,)*16)

    def test_failed_http_sample_clears_previous_nonzero_data(self):
        reader = PreviewReader('http://127.0.0.1/unused')
        reader.snapshot = snapshot()
        reader.opener = MagicMock()
        reader.opener.open.side_effect = OSError('offline')
        reader._sample()
        self.assertIsNone(reader.get()[0])

    def test_udp_can_read_zero_while_http_is_blocked(self):
        reader = PreviewReader('http://127.0.0.1/unused')
        reader.opener = MagicMock()
        import threading
        entered, release = threading.Event(), threading.Event()
        def block(*args, **kwargs):
            entered.set()
            release.wait(1)
            raise OSError('offline')
        reader.opener.open.side_effect = block
        reader.start()
        try:
            self.assertTrue(entered.wait(.5))
            started = time.monotonic()
            self.assertIsNone(reader.get()[0])
            self.assertLess(time.monotonic()-started, .05)
        finally:
            release.set()
            reader.close()


class GlovePacketTests(unittest.TestCase):
    def test_source_status_separates_absent_stale_and_missing_right_hand(self):
        self.assertEqual(quest_input_status(None), "RELAY_UNAVAILABLE")
        self.assertEqual(quest_input_status({"mode": "monitor-only", "cue": None, "grip": None}), "WAITING_FOR_VR")
        self.assertEqual(quest_input_status({"mode": "unknown"}), "INVALID_PREVIEW")
        self.assertEqual(quest_input_status(snapshot()), "RIGHT_HAND_TRACKING")
        self.assertEqual(quest_input_status(snapshot(), .25), "STALE_VR_DATA")
        for changes in ({"hand": "left"}, {"trackingValid": False}, {"source": "desktop-preview"}):
            value = snapshot()
            value["cue"].update(changes)
            value["grip"].update(changes)
            self.assertEqual(quest_input_status(value), "NO_RIGHT_HAND_TRACKING")

    def test_all_five_channels_keep_order_and_fit_existing_frame(self):
        value = snapshot(); value["cue"]["duties"] = [10, 95, 120, 140, 160]
        value["cue"]["patterns"] = [0, 1, 2, 3, 0]
        packet = command_packet(value, 123, 456, 65535, 100, KEY)
        self.assertLessEqual(len(packet.encode()), 66)
        p = decode(packet.encode())
        self.assertEqual(p.kind, COMMAND)
        body = BODY.unpack(authenticated(p, BODY.size, KEY))
        self.assertEqual(body[:4], (123, 456, 250, 3))
        self.assertEqual(list(body[4:9]), value["cue"]["duties"])
        self.assertEqual(list(body[9:14]), value["cue"]["patterns"])
        self.assertEqual(list(body[14:19]), value["grip"]["resistance"])

    def test_tampering_any_finger_and_old_index_kind_fail_authentication(self):
        packet = command_packet(snapshot(), 123, 456, 10, 100, KEY)
        for position in range(len(packet.payload)):
            changed = bytearray(packet.payload); changed[position] ^= 1
            with self.assertRaises(ValueError):
                authenticated(Packet(COMMAND, 10, 100, bytes(changed)), BODY.size, KEY)
        with self.assertRaises(ValueError):
            authenticated(Packet(7, 10, 100, packet.payload), BODY.size, KEY)

    def test_release_tracking_loss_synthetic_and_staleness_zero_all_fingers(self):
        for changes in ({"holding": False}, {"trackingValid": False}, {"source": "desktop-preview"}, {"ageMs": 250}):
            value = snapshot(); value["grip"].update(changes)
            body = BODY.unpack(command_packet(value, 1, 2, 3, 4, KEY).payload[:BODY.size])
            self.assertEqual(body[14:19], (0,)*5)
            self.assertFalse(body[3] & 2)
        for elapsed in (.25, .6):
            body = BODY.unpack(command_packet(snapshot(), 1, 2, 3, 4, KEY, elapsed).payload[:BODY.size])
            self.assertEqual(body[3:], (0,)*16)
        for field, channel in (("cue", "duties"), ("grip", "resistance")):
            value = snapshot(); value[field][channel][4] = 255
            body = BODY.unpack(command_packet(value, 1, 2, 3, 4, KEY).payload[:BODY.size])
            self.assertEqual(body[4:9] if field == "cue" else body[14:19], (0,)*5)


class GloveUdpTests(unittest.TestCase):
    def setUp(self):
        self.esp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.esp.bind(("127.0.0.1", 0)); self.esp.settimeout(1)
        self.glove = WirelessGlove(self.esp.getsockname(), KEY, session=123)

    def tearDown(self):
        self.glove.close(); self.esp.close()

    def receive(self):
        frame, peer = self.esp.recvfrom(128)
        return decode(frame), peer

    def reply(self, p, peer, body, kind=RECEIPT, key=KEY):
        self.esp.sendto(signed(kind, p.sequence, 0, body, key).encode(), peer)
        time.sleep(.002)
        return self.glove.poll()

    def pair(self):
        self.glove.send(None); p, peer = self.receive()
        self.assertEqual(p.kind, HELLO)
        self.reply(p, peer, HELLO_ACK.pack(123, 456), HELLO_RECEIPT)
        self.assertEqual(self.glove.boot, 456)

    def ack(self, p, **changes):
        value = dict(session=123, boot=456, checksum=crc16(p.payload[:BODY.size]), motors=31, servos=31,
                     pwm=[10, 95, 120, 140, 160], pulses=[1500, 1510, 1490, 1520, 1480], signal=31, reason=1)
        value.update(changes)
        return ACK.pack(value["session"], value["boot"], value["checksum"], value["motors"], value["servos"],
                        *value["pwm"], *value["pulses"], value["signal"], value["reason"])

    def test_ack_requires_actual_matching_auth_and_reports_five_output_commands(self):
        self.pair(); self.glove.send(snapshot()); p, peer = self.receive()
        for changes in ({"session": 124}, {"boot": 457}, {"checksum": 0}, {"motors": 0},
                        {"pulses": [1500, 1500, 1500, 1500, 1700]}, {"signal": 32}, {"reason": 99}):
            self.assertIsNone(self.reply(p, peer, self.ack(p, **changes)))
        self.assertIsNone(self.reply(p, peer, self.ack(p), key=bytes([1])*32))
        result = self.reply(p, peer, self.ack(p))
        self.assertEqual(result["vibration"], [95]*5)
        self.assertEqual(result["resistance"], [15, 16, 17, 18, 19])
        self.assertEqual(result["servoUs"], [1500, 1510, 1490, 1520, 1480])
        self.assertEqual(result["motorMask"], 31)
        self.reply(p, peer, self.ack(p)); self.assertEqual(self.glove.received, 1)

    def test_old_ack_cannot_replace_new_stop_and_receipt_expires(self):
        self.pair(); self.glove.send(snapshot()); old, peer = self.receive()
        self.glove.send(None); new, _ = self.receive()
        result = self.reply(new, peer, self.ack(new, motors=0, servos=0, pwm=[0]*5, signal=0, reason=4))
        self.assertEqual(result["reason"], "LINK_LOST")
        self.reply(old, peer, self.ack(old))
        self.assertEqual(self.glove.last_receipt["sequence"], new.sequence)
        with patch("aham.wifi_glove.time.monotonic", return_value=result["receivedAt"]+.6):
            self.assertIsNone(self.glove.poll())

    def test_wider_sweep_receipts_require_zero_request_and_one_selected_servo(self):
        self.pair()
        for finger in range(5):
            bit = 1 << finger
            for target in (1750, 1250):
                self.glove.send(None); packet, peer = self.receive()
                pulses = [1500] * 5; pulses[finger] = target
                result = self.reply(packet, peer, self.ack(packet, motors=0, servos=bit,
                                    pwm=[0]*5, pulses=pulses, signal=bit))
                self.assertEqual(result['servoUs'][finger], target)
        self.glove.send(None); packet, peer = self.receive()
        valid = dict(motors=0, servos=2, pwm=[0]*5, pulses=[1500,1750,1500,1500,1500], signal=2)
        received = self.glove.received
        for changes in ({'servos':31}, {'signal':0}, {'reason':4},
                        {'pulses':[1750,1750,1500,1500,1500]},
                        {'pulses':[1500,1751,1500,1500,1500]},
                        {'pulses':[1500,1249,1500,1500,1500]}, {'pwm':[0,1,0,0,0]}):
            self.reply(packet, peer, self.ack(packet, **dict(valid, **changes)))
            self.assertEqual(self.glove.received, received)
        self.glove.send(snapshot()); packet, peer = self.receive()
        self.reply(packet, peer, self.ack(packet, **valid))
        self.assertEqual(self.glove.received, received)  # Wide pulses cannot be accepted for VR grip/contact.

    def test_wrong_key_unsolicited_hello_and_reboot_nonce_handling(self):
        self.glove.send(None); hello, peer = self.receive()
        self.reply(hello, peer, HELLO_ACK.pack(123, 456), HELLO_RECEIPT, key=bytes([1])*32)
        self.assertEqual(self.glove.boot, 0)
        unsolicited = Packet(HELLO, 25, 0, b"")
        self.reply(unsolicited, peer, HELLO_ACK.pack(123, 456), HELLO_RECEIPT)
        self.assertEqual(self.glove.boot, 0)
        self.reply(hello, peer, HELLO_ACK.pack(123, 456), HELLO_RECEIPT)
        self.glove.last_hello = -10; self.glove.send(snapshot())
        hello, peer = self.receive(); command, _ = self.receive()
        self.reply(hello, peer, HELLO_ACK.pack(123, 789), HELLO_RECEIPT)
        self.assertEqual(self.glove.boot, 789)
        self.assertFalse(self.glove.pending)
        self.assertIsNone(self.glove.last_receipt)
        self.assertEqual(BODY.unpack(command.payload[:BODY.size])[1], 456)


if __name__ == "__main__":
    unittest.main()
