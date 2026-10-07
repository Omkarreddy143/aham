"""Wi-Fi observation protocol and real loopback UDP receipts; no actuator route."""
from pathlib import Path
import socket
import sys
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "host"))
from aham.protocol import Packet, crc16, decode, haptic
from aham.wifi_monitor import (ACK, BODY, PREVIEW, RECEIPT, WirelessMonitor,
                               lan_ip, preview_packet, preview_values)


def snapshot(**changes):
    value = {"mode": "monitor-only", "cue": {"source": "webxr", "hand": "right", "trackingValid": True,
             "ageMs": 0, "duties": [95, 95, 95, 95, 95], "patterns": [1]*5},
             "grip": {"source": "webxr", "hand": "right", "trackingValid": True, "holding": True,
                      "actuatorsEnabled": False, "objectId": "mint", "gripMode": "grip", "ageMs": 0,
                      "resistance": [15, 16, 17, 18, 19], "referenceCurl": [40, 45, 50, 55, 60]}}
    value.update(changes)
    return value


class WifiProtocolTests(unittest.TestCase):
    def test_binary_round_trip_uses_separate_observation_kind_and_fixed_channel_order(self):
        packet = preview_packet(snapshot(), 0x12345678, 65535, 100)
        decoded = decode(packet.encode())
        self.assertEqual(decoded.kind, PREVIEW)
        values = preview_values(decoded)
        self.assertEqual(values["session"], 0x12345678)
        self.assertEqual(values["leaseMs"], 250)
        self.assertEqual(values["flags"], 3)
        self.assertEqual(values["resistance"], [15, 16, 17, 18, 19])
        self.assertEqual(values["vibration"], [95]*5)

    def test_preview_tracking_loss_release_and_stale_snapshots_zero_affected_channels(self):
        for field in ("cue", "grip"):
            for change in ({"source": "desktop-preview"}, {"trackingValid": False}, {"ageMs": 500}, {"hand": "left"}):
                value = snapshot()
                value[field].update(change)
                result = preview_values(preview_packet(value, 1, 0, 0))
                self.assertEqual(result["vibration" if field=="cue" else "resistance"], [0]*5)
        value = snapshot()
        value["grip"]["holding"] = False
        self.assertEqual(preview_values(preview_packet(value, 1, 0, 0))["resistance"], [0]*5)
        self.assertEqual(preview_values(preview_packet(snapshot(), 1, 0, 0, elapsed=.6))["flags"], 0)
        for value in (None, {}, {"mode": "actuator"}, {"mode": "monitor-only", "cue": []}):
            self.assertEqual(preview_values(preview_packet(value, 1, 0, 0))["flags"], 0)

    def test_invalid_channel_ranges_types_and_actuator_mode_fail_closed(self):
        for field, channel in (("cue", "duties"), ("grip", "resistance")):
            for values in ([999]*5, [True]*5, [1.1]*5, [1]*4, None):
                value = snapshot()
                value[field][channel] = values
                result = preview_values(preview_packet(value, 1, 0, 0))
                self.assertEqual(result["vibration" if field=="cue" else "resistance"], [0]*5)
        value=snapshot();value["grip"]["actuatorsEnabled"]=True
        self.assertEqual(preview_values(preview_packet(value,1,0,0))["resistance"],[0]*5)
        with self.assertRaises(ValueError):
            preview_values(haptic(0,0,[0]*5))
        payload=bytearray(preview_packet(None,1,0,0).payload);payload[17]=1
        with self.assertRaises(ValueError):
            preview_values(Packet(PREVIEW,0,0,bytes(payload)))

    def test_cli_destination_is_a_private_unicast_ipv4(self):
        import argparse
        self.assertEqual(lan_ip("192.168.43.42"),"192.168.43.42")
        for address in ("8.8.8.8","127.0.0.1","0.0.0.0","224.0.0.1","::1","hostname"):
            with self.assertRaises(argparse.ArgumentTypeError):
                lan_ip(address)


class WifiReceiptTests(unittest.TestCase):
    def setUp(self):
        self.esp = socket.socket(socket.AF_INET,socket.SOCK_DGRAM)
        self.esp.bind(("127.0.0.1",0));self.esp.settimeout(1)
        self.monitor = WirelessMonitor(self.esp.getsockname(), session=123)

    def tearDown(self):
        self.monitor.close();self.esp.close()

    def ack(self, packet, peer, session=None, checksum=None, motor=0, servo=0, kind=RECEIPT):
        ack = Packet(kind,packet.sequence,0,ACK.pack(session or 123,
                     crc16(packet.payload) if checksum is None else checksum,motor,servo))
        self.esp.sendto(ack.encode(),peer)

    def await_receipt(self):
        deadline=time.monotonic()+1
        while time.monotonic()<deadline:
            if self.monitor.poll():return self.monitor.last_receipt
            time.sleep(.002)
        self.fail("No matching mock ESP receipt")

    def test_receipt_requires_actual_matching_udp_ack_and_never_claims_output(self):
        self.monitor.send(snapshot())
        frame,peer=self.esp.recvfrom(128);packet=decode(frame)
        self.assertIsNone(self.monitor.poll())
        for changes in ({"session":124},{"checksum":0},{"motor":1},{"servo":1},{"kind":2}):
            self.ack(packet,peer,**changes);self.monitor.poll()
        self.assertEqual(self.monitor.received,0)
        self.ack(packet,peer)
        receipt=self.await_receipt()
        self.assertEqual(receipt["resistance"],[15,16,17,18,19])
        self.assertFalse(receipt["actuatorsEnabled"])
        self.ack(packet,peer);self.monitor.poll();self.assertEqual(self.monitor.received,1)

    def test_old_receipts_expire_and_outgoing_sequence_wraps(self):
        self.monitor.sequence=65535;self.monitor.send(snapshot())
        frame,peer=self.esp.recvfrom(128);packet=decode(frame);self.assertEqual(packet.sequence,65535)
        self.assertEqual(self.monitor.sequence,0)
        sent_at=self.monitor.pending[65535][0]
        self.ack(packet,peer)
        with patch("aham.wifi_monitor.time.monotonic",return_value=sent_at+.6):
            self.assertIsNone(self.monitor.poll())
        self.assertEqual(self.monitor.received,0)
