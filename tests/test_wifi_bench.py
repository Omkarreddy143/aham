"""Authenticated one-channel bench packets, freshness and actual UDP receipt matching."""
from pathlib import Path
import socket
import sys
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "host"))
from aham.protocol import Packet, crc16, decode
from aham.wifi_bench import (ACK, BODY, COMMAND, HELLO, HELLO_ACK, HELLO_RECEIPT,
                            RECEIPT, WirelessBench, authenticated, command_packet, signed)
from test_wifi_monitor import snapshot

KEY = bytes(range(32))  # Public test vector only; NEVER a deployment key.


class BenchPacketTests(unittest.TestCase):
    def test_index_selection_and_authentication_round_trip(self):
        value = snapshot()
        value["cue"]["duties"] = [11, 95, 12, 13, 14]
        packet = command_packet(value, 123, 456, 65535, 100, KEY)
        packet = decode(packet.encode())
        self.assertEqual(packet.kind, COMMAND)
        self.assertEqual(BODY.unpack(authenticated(packet, BODY.size, KEY)), (123, 456, 250, 3, 95, 1, 16))

    def test_changes_to_any_header_body_or_tag_invalidate_signature(self):
        original = command_packet(snapshot(), 123, 456, 20, 100, KEY)
        for packet in (Packet(5, 20, 100, original.payload), Packet(COMMAND, 21, 100, original.payload),
                       Packet(COMMAND, 20, 101, original.payload)):
            with self.assertRaises(ValueError):
                authenticated(packet, BODY.size, KEY)
        for i in range(len(original.payload)):
            changed = bytearray(original.payload); changed[i] ^= 1
            with self.assertRaises(ValueError):
                authenticated(Packet(COMMAND, 20, 100, bytes(changed)), BODY.size, KEY)
        with self.assertRaises(ValueError):
            authenticated(original, BODY.size, bytes([1])*32)

    def test_tracking_loss_release_age_and_fetch_delay_zero_requests(self):
        for change in ({"trackingValid": False}, {"holding": False}, {"ageMs": 250}):
            value = snapshot(); value["grip"].update(change)
            body = BODY.unpack(command_packet(value, 1, 2, 3, 4, KEY).payload[:BODY.size])
            self.assertEqual(body[6], 0)
            self.assertFalse(body[3] & 2)
        for value, elapsed in ((None, 0), (snapshot(), .25), ({}, 0)):
            body = BODY.unpack(command_packet(value, 1, 2, 3, 4, KEY, elapsed).payload[:BODY.size])
            self.assertEqual(body[3:], (0, 0, 0, 0))
        with self.assertRaises(ValueError):
            command_packet(snapshot(), 1, 0, 3, 4, KEY)


class BenchUdpTests(unittest.TestCase):
    def setUp(self):
        self.esp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.esp.bind(("127.0.0.1", 0)); self.esp.settimeout(1)
        self.sender = WirelessBench(self.esp.getsockname(), KEY, session=123)

    def tearDown(self):
        self.sender.close(); self.esp.close()

    def receive(self):
        frame, peer = self.esp.recvfrom(128)
        return decode(frame), peer

    def reply(self, packet, peer, body, kind, key=KEY):
        self.esp.sendto(signed(kind, packet.sequence, 0, body, key).encode(), peer)
        time.sleep(.002)
        return self.sender.poll()

    def pair(self):
        self.sender.send(snapshot())
        hello, peer = self.receive()
        self.assertEqual(hello.kind, HELLO)
        self.reply(hello, peer, HELLO_ACK.pack(123, 456), HELLO_RECEIPT)
        self.assertEqual(self.sender.boot, 456)

    def test_only_authenticated_matching_receipt_reports_actual_commanded_output(self):
        self.pair()
        self.sender.send(snapshot())
        command, peer = self.receive()
        checksum = crc16(command.payload[:BODY.size])
        for body in (ACK.pack(124, 456, checksum, 3, 95, 1504, 1, 1),
                     ACK.pack(123, 457, checksum, 3, 95, 1504, 1, 1),
                     ACK.pack(123, 456, 0, 3, 95, 1504, 1, 1),
                     ACK.pack(123, 456, checksum, 0, 95, 1504, 1, 1),
                     ACK.pack(123, 456, checksum, 3, 95, 1700, 1, 1)):
            self.assertIsNone(self.reply(command, peer, body, RECEIPT))
        body = ACK.pack(123, 456, checksum, 3, 95, 1504, 1, 1)
        self.assertIsNone(self.reply(command, peer, body, RECEIPT, key=bytes([1])*32))
        receipt = self.reply(command, peer, body, RECEIPT)
        self.assertEqual(receipt["vibration"], 95)
        self.assertEqual(receipt["resistance"], 16)
        self.assertEqual(receipt["armed"], 3)
        self.assertEqual(receipt["servoUs"], 1504)
        self.assertTrue(receipt["servoSignal"])
        self.reply(command, peer, body, RECEIPT)
        self.assertEqual(self.sender.received, 1)

    def test_wrong_pairing_key_and_unsolicited_handshake_are_rejected(self):
        self.sender.send(None)
        hello, peer = self.receive()
        self.reply(hello, peer, HELLO_ACK.pack(123, 456), HELLO_RECEIPT, key=bytes([1])*32)
        self.assertEqual(self.sender.boot, 0)
        unsolicited = Packet(HELLO, (hello.sequence+10)&0xffff, 0, b"")
        self.reply(unsolicited, peer, HELLO_ACK.pack(123, 456), HELLO_RECEIPT)
        self.assertEqual(self.sender.boot, 0)

    def test_new_boot_clears_receipts_and_old_pending_commands(self):
        self.pair()
        self.sender.last_hello = -10
        self.sender.send(None)
        hello, peer = self.receive()
        command, _ = self.receive()
        self.reply(hello, peer, HELLO_ACK.pack(123, 789), HELLO_RECEIPT)
        self.assertEqual(self.sender.boot, 789)
        self.assertFalse(self.sender.pending)
        self.assertIsNone(self.sender.last_receipt)
        self.assertNotEqual(BODY.unpack(command.payload[:BODY.size])[1], self.sender.boot)

    def test_late_receipt_expires(self):
        self.pair(); self.sender.send(snapshot())
        packet, peer = self.receive()
        now = self.sender.pending[packet.sequence][0]
        body = ACK.pack(123, 456, crc16(packet.payload[:BODY.size]), 0, 0, 1500, 0, 0)
        self.esp.sendto(signed(RECEIPT, packet.sequence, 0, body, KEY).encode(), peer)
        with patch("aham.wifi_bench.time.monotonic", return_value=now+.6):
            self.assertIsNone(self.sender.poll())

    def test_out_of_order_receipts_cannot_replace_newer_disarmed_report(self):
        self.pair(); self.sender.send(snapshot()); older, peer = self.receive()
        self.sender.send(None); newer, _ = self.receive()
        self.reply(newer, peer, ACK.pack(123, 456, crc16(newer.payload[:BODY.size]), 0, 0, 1500, 0, 4), RECEIPT)
        self.reply(older, peer, ACK.pack(123, 456, crc16(older.payload[:BODY.size]), 3, 95, 1504, 1, 1), RECEIPT)
        self.assertEqual(self.sender.last_receipt["sequence"], newer.sequence)
        self.assertEqual(self.sender.last_receipt["armed"], 0)


if __name__ == "__main__":
    unittest.main()
