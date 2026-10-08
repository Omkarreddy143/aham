"""Paired-device discovery uses only HELLO, rejects forged replies and confines its subnet."""
from pathlib import Path
import socket
import sys
import threading
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "host"))
from aham.protocol import decode
from aham.wifi_bench import HELLO, HELLO_BODY, HELLO_ACK, HELLO_RECEIPT, authenticated, signed
from aham.wifi_discovery import discover, probe_targets

KEY = bytes(range(32))


class DiscoveryTests(unittest.TestCase):
    def test_scan_is_confined_to_one_small_private_subnet(self):
        targets = probe_targets("10.0.0.18", "10.0.0.0/24")
        self.assertEqual(targets[0], "10.0.0.18")
        self.assertEqual(len(targets), 255)
        self.assertIn("10.0.0.255", targets)
        for network in ("10.0.0.0/23", "10.0.1.0/24", "8.8.8.0/24"):
            with self.assertRaises(ValueError):
                probe_targets("10.0.0.18", network)

    def test_hello_only_and_forged_reply_is_not_a_discovery(self):
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as esp:
            esp.bind(("127.0.0.1", 0)); esp.settimeout(1)
            frames, errors = [], []
            def respond():
                try:
                    frame, sender = esp.recvfrom(128)
                    packet = decode(frame); frames.append(packet)
                    session, = HELLO_BODY.unpack(authenticated(packet, HELLO_BODY.size, KEY))
                    body = HELLO_ACK.pack(session, 123)
                    esp.sendto(signed(HELLO_RECEIPT, packet.sequence, 0, body, bytes([1])*32).encode(), sender)
                    esp.sendto(signed(HELLO_RECEIPT, (packet.sequence+1)&65535, 0, body, KEY).encode(), sender)
                    esp.sendto(signed(HELLO_RECEIPT, packet.sequence, 0, body, KEY).encode(), sender)
                except Exception as error:
                    errors.append(error)
            worker = threading.Thread(target=respond); worker.start()
            result = discover("127.0.0.1", KEY, port=esp.getsockname()[1], timeout=1)
            worker.join(timeout=1)
            self.assertFalse(errors)
            self.assertEqual(result, {"ip": "127.0.0.1", "port": esp.getsockname()[1], "authenticated": True})
            self.assertEqual([packet.kind for packet in frames], [HELLO])
            esp.settimeout(.03)
            with self.assertRaises(socket.timeout):
                esp.recvfrom(128)  # No output command follows a discovery receipt.


if __name__ == "__main__":
    unittest.main()
