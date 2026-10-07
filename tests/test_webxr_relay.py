"""HTTP/UDP integration tests; no serial devices or actuator listeners are used."""
import http.client
import io
import json
from pathlib import Path
import socket
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "host"))
from aham import webxr_relay
from aham.cue_monitor import cue_values
from aham.protocol import (HAPTIC, HAPTIC_PAYLOAD, TELEMETRY, TELEMETRY_PAYLOAD,
                           Packet, control, decode, haptic, telemetry)


class WebXRRelayTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name) / "webxr"
        self.root.mkdir()
        (self.root / "index.html").write_text("<h1>WebXR monitor</h1>", encoding="utf-8")
        (self.root / "app.js").write_text("console.log('monitor');", encoding="utf-8")
        (self.root / "notes.py").write_text("private = True", encoding="utf-8")
        (Path(self.directory.name) / "secret.html").write_text("outside", encoding="utf-8")
        # Patch the fixed observation target only in tests, so every listener can
        # use an ephemeral port without touching an existing bridge on 8767.
        self.monitor = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.monitor.bind(("127.0.0.1", 0))
        self.monitor.settimeout(1)
        self.destination_patch = patch.object(webxr_relay, "MONITOR_ADDRESS", self.monitor.getsockname())
        self.destination_patch.start()
        self.relay = webxr_relay.Relay(telemetry_port=0)
        self.server = webxr_relay.create_server(self.relay, port=0, static_root=self.root)
        self.worker = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.worker.start()
        self.host = f"127.0.0.1:{self.server.server_port}"
        self.receipt_address = ("127.0.0.1", self.relay.telemetry_port)

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.worker.join(timeout=1)
        self.relay.close()
        self.monitor.close()
        self.destination_patch.stop()
        self.directory.cleanup()

    def cue(self, **changes):
        value = {"version": 1, "source": "webxr", "hand": "right", "trackingValid": True,
                 "duties": [0, 120, 10, 0, 160], "patterns": [0, 2, 1, 0, 3]}
        value.update(changes)
        return value

    def request(self, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=2)
        try:
            connection.request(method, path, body=body, headers=headers or {})
            response = connection.getresponse()
            data = response.read()
            return response.status, data, dict(response.getheaders())
        finally:
            connection.close()

    def post(self, value, headers=None):
        actual_headers = {"Content-Type": "application/json"}
        if headers:
            actual_headers.update(headers)
        status, body, _ = self.request("POST", "/api/cue", json.dumps(value).encode(), actual_headers)
        return status, json.loads(body)

    def status(self):
        status, body, _ = self.request("GET", "/api/status")
        self.assertEqual(status, 200)
        return json.loads(body)

    def wait_for(self, predicate):
        deadline = time.monotonic() + 1
        while time.monotonic() < deadline:
            value = self.status()
            if predicate(value):
                return value
            time.sleep(0.005)
        self.fail("Timed out waiting for a validated UDP receipt")

    def echo_next(self):
        frame, _ = self.monitor.recvfrom(256)
        packet = decode(frame)
        self.monitor.sendto(frame, self.receipt_address)
        return packet

    def udp_barrier(self, sequence):
        """A board packet after test datagrams confirms that they were processed."""
        payload = TELEMETRY_PAYLOAD.pack(0, 0, 0, *([0] * 16), 0)
        self.monitor.sendto(Packet(TELEMETRY, sequence, 0, payload).encode(), self.receipt_address)
        return self.wait_for(lambda value: value["board"] is not None
                             and value["board"]["sequence"] == sequence)

    def test_tracked_cue_is_encoded_and_received_only_after_monitor_echo(self):
        self.assertEqual(self.status(), {"mode": "monitor-only", "received": None, "board": None})
        status, response = self.post(self.cue())
        self.assertEqual(status, 200)
        self.assertEqual(response, {"accepted": True, "monitorOnly": True, "sequence": 0})
        self.assertIsNone(self.status()["received"], "HTTP acceptance is not receipt confirmation")
        packet = self.echo_next()
        self.assertEqual(packet.kind, HAPTIC)
        self.assertEqual(packet.sequence, 0)
        self.assertEqual(cue_values(packet), {"duties": self.cue()["duties"], "patterns": self.cue()["patterns"]})
        received = self.wait_for(lambda value: value["received"] is not None)["received"]
        self.assertEqual(received["duties"], self.cue()["duties"])
        self.assertEqual(received["patterns"], self.cue()["patterns"])
        self.assertEqual(received["sequence"], response["sequence"])
        self.assertGreaterEqual(received["ageMs"], 0)
        self.assertLess(received["ageMs"], 500)

    def test_preview_and_tracking_loss_send_only_zero_cues(self):
        for sequence, changes in enumerate((
            {"source": "desktop-preview"},
            {"trackingValid": False},
            {"source": "desktop-preview", "trackingValid": False, "hand": "left"},
        )):
            with self.subTest(changes=changes):
                status, result = self.post(self.cue(**changes))
                self.assertEqual(status, 200)
                self.assertEqual(result["sequence"], sequence)
                packet = self.echo_next()
                self.assertEqual(cue_values(packet), {"duties": [0] * 5, "patterns": [0] * 5})
                received = self.wait_for(lambda value: value["received"] is not None
                                         and value["received"]["sequence"] == sequence)["received"]
                self.assertEqual(received["duties"], [0] * 5)
                self.assertEqual(received["patterns"], [0] * 5)

    def test_unsolicited_and_nonmatching_other_app_echoes_cannot_confirm_receipt(self):
        value = self.cue()
        self.monitor.sendto(haptic(0, 0, value["duties"], value["patterns"]).encode(), self.receipt_address)
        self.assertIsNone(self.udp_barrier(101)["received"])

        self.assertEqual(self.post(value)[0], 200)
        submitted_frame, _ = self.monitor.recvfrom(256)
        submitted = decode(submitted_frame)
        unrelated = (
            # Same sequence and channel values, but another source's timestamp.
            haptic(submitted.sequence, submitted.time_ms + 1, value["duties"], value["patterns"]),
            haptic(submitted.sequence + 1, submitted.time_ms, value["duties"], value["patterns"]),
            # Same sequence/time/channel values but a different valid payload.
            haptic(submitted.sequence, submitted.time_ms, value["duties"], value["patterns"], lease_ms=99),
        )
        for packet in unrelated:
            self.monitor.sendto(packet.encode(), self.receipt_address)
        self.assertIsNone(self.udp_barrier(102)["received"])
        self.monitor.sendto(submitted_frame, self.receipt_address)
        received = self.wait_for(lambda current: current["received"] is not None)["received"]
        self.assertEqual(received["sequence"], submitted.sequence)
        self.assertEqual(received["duties"], value["duties"])

    def test_submitted_echo_older_than_500ms_is_not_a_new_receipt(self):
        self.post(self.cue())
        frame, _ = self.monitor.recvfrom(256)
        time.sleep(0.525)
        self.monitor.sendto(frame, self.receipt_address)
        self.assertIsNone(self.udp_barrier(103)["received"])
        self.post(self.cue())
        newest = self.echo_next()
        received = self.wait_for(lambda value: value["received"] is not None)["received"]
        self.assertEqual(received["sequence"], newest.sequence)

    def test_recent_cue_queue_is_bounded_to_32_submissions(self):
        frames = []
        for _ in range(33):
            self.relay.submit(self.cue())
            frames.append(self.monitor.recvfrom(256)[0])
        self.assertEqual(len(self.relay.recent_cues), 32)
        self.monitor.sendto(frames[0], self.receipt_address)
        self.assertIsNone(self.udp_barrier(104)["received"])
        self.monitor.sendto(frames[-1], self.receipt_address)
        received = self.wait_for(lambda value: value["received"] is not None)["received"]
        self.assertEqual(received["sequence"], 32)

    def test_rejects_invalid_fields_types_ranges_and_nonfinite_numbers(self):
        missing = self.cue()
        del missing["hand"]
        invalid = [None, [], missing, self.cue(extra="unknown"), self.cue(version=True),
                   self.cue(version=2), self.cue(source="unity"), self.cue(hand="both"),
                   self.cue(trackingValid=1), self.cue(duties=[0] * 4),
                   self.cue(duties=[False, 0, 0, 0, 0]), self.cue(duties=[0, 161, 0, 0, 0]),
                   self.cue(duties=[0, -1, 0, 0, 0]), self.cue(duties=[0, 1.0, 0, 0, 0]),
                   self.cue(duties=[0, float("nan"), 0, 0, 0]),
                   self.cue(duties=[0, float("inf"), 0, 0, 0]),
                   self.cue(patterns=[0, 4, 0, 0, 0]), self.cue(patterns=[True] * 5),
                   self.cue(patterns="00000"), self.cue(source="desktop-preview", duties=[999] * 5)]
        for value in invalid:
            with self.subTest(value=value):
                self.assertEqual(self.post(value)[0], 400)
        self.monitor.settimeout(0.03)
        with self.assertRaises(socket.timeout):
            self.monitor.recvfrom(256)
        self.assertEqual(self.post(self.cue())[1]["sequence"], 0)

    def test_rejects_bad_json_duplicate_fields_content_type_and_oversize(self):
        duplicate = json.dumps(self.cue())[:-1] + ',"version":1}'
        for body in (b"{", b"\xff", duplicate.encode(), b" " * 4097):
            with self.subTest(body=body[:30]):
                status, _, _ = self.request("POST", "/api/cue", body, {"Content-Type": "application/json"})
                self.assertEqual(status, 400)
        for headers in ({}, {"Content-Type": "text/plain"}):
            self.assertEqual(self.request("POST", "/api/cue", json.dumps(self.cue()), headers)[0], 400)
        self.assertEqual(self.request("POST", "/api/cue", b"{}", {
            "Content-Type": "application/json", "Transfer-Encoding": "chunked"})[0], 400)

    def test_same_origin_is_required_on_status_and_cue_when_origin_present(self):
        for origin in ("https://other.example", "null", f"https://{self.host}"):
            with self.subTest(origin=origin):
                self.assertEqual(self.post(self.cue(), {"Origin": origin})[0], 403)
                self.assertEqual(self.request("GET", "/api/status", headers={"Origin": origin})[0], 403)
        self.assertEqual(self.post(self.cue(), {"Origin": f"http://{self.host}"})[0], 200)
        self.assertEqual(self.request("GET", "/api/status", headers={"Origin": f"http://{self.host}"})[0], 200)

    def test_only_the_configured_exact_external_https_origin_is_allowed(self):
        origin = "https://aham-tunnel.example"
        self.assertEqual(self.post(self.cue(), {"Origin": origin})[0], 403)
        self.assertEqual(self.post(self.cue(), {
            "Origin": origin, "X-Forwarded-Host": "aham-tunnel.example",
            "X-Forwarded-Proto": "https", "Forwarded": "host=aham-tunnel.example;proto=https",
        })[0], 403)
        self.server.shutdown()
        self.server.server_close()
        self.worker.join(timeout=1)
        self.server = webxr_relay.create_server(self.relay, port=0, static_root=self.root,
                                               external_origin=origin)
        self.worker = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.worker.start()
        self.host = f"127.0.0.1:{self.server.server_port}"
        self.assertEqual(self.post(self.cue(), {"Origin": origin})[0], 200)
        self.assertEqual(self.request("GET", "/api/status", headers={"Origin": origin})[0], 200)
        self.assertEqual(self.post(self.cue(), {"Origin": f"http://{self.host}"})[0], 200)
        self.assertEqual(self.post(self.cue())[0], 200)
        for wrong in ("https://other.example", "http://aham-tunnel.example",
                      origin + ":8443", origin + "/", origin + ".other.example"):
            with self.subTest(origin=wrong):
                self.assertEqual(self.post(self.cue(), {
                    "Origin": wrong, "X-Forwarded-Host": "aham-tunnel.example",
                    "X-Forwarded-Proto": "https",
                })[0], 403)
                self.assertEqual(self.request("GET", "/api/status", headers={"Origin": wrong})[0], 403)

    def test_valid_board_telemetry_is_decoded_and_both_receipts_expire(self):
        self.post(self.cue())
        self.echo_next()
        payload = TELEMETRY_PAYLOAD.pack(0, 1, 0, 0, 700, 0, 0, 0,
                                         900, 1100, 900, 900, 900, 0, *([0] * 5), 8)
        packet = Packet(TELEMETRY, 77, 456, payload)
        self.monitor.sendto(packet.encode(), self.receipt_address)
        values = self.wait_for(lambda value: value["board"] is not None and value["received"] is not None)
        board = dict(values["board"])
        self.assertLess(board.pop("ageMs"), 200)
        self.assertEqual(board, telemetry(packet))
        time.sleep(0.225)
        values = self.status()
        self.assertIsNone(values["board"])
        self.assertIsNotNone(values["received"])
        time.sleep(0.300)
        self.assertIsNone(self.status()["received"])

    def test_corrupt_invalid_and_unrelated_udp_packets_are_ignored(self):
        bad_crc = bytearray(haptic(9, 0, [0] * 5).encode())
        bad_crc[-2] ^= 1
        invalid_cue = Packet(HAPTIC, 10, 0, HAPTIC_PAYLOAD.pack(100, 0, 161, 0, 0, 0, *([0] * 5), 0, 0))
        invalid_board = Packet(TELEMETRY, 11, 0, TELEMETRY_PAYLOAD.pack(4, 0, 0, *([0] * 16), 0))
        for frame in (b"bad\0", bytes(bad_crc), invalid_cue.encode(), invalid_board.encode(),
                      Packet(TELEMETRY, 12, 0, b"short").encode(), control(13, 0, 1).encode()):
            self.monitor.sendto(frame, self.receipt_address)
        # A genuine submitted echo provides a deterministic receiver barrier.
        self.post(self.cue())
        submitted = self.echo_next()
        values = self.wait_for(lambda value: value["received"] is not None)
        self.assertEqual(values["received"]["sequence"], submitted.sequence)
        self.assertIsNone(values["board"])

    def test_files_are_confined_and_extensions_are_allowlisted(self):
        status, body, headers = self.request("GET", "/")
        self.assertEqual(status, 200)
        self.assertIn(b"WebXR monitor", body)
        self.assertTrue(headers["Content-Type"].startswith("text/html"))
        self.assertEqual(headers["X-Content-Type-Options"], "nosniff")
        self.assertEqual(self.request("GET", "/app.js?v=1")[0], 200)
        for path in ("/../secret.html", "/%2e%2e/secret.html", "/%2e%2e%2fsecret.html",
                     "/..%5csecret.html", "/%00index.html", "/C:/secret.html", "/notes.py",
                     "/missing.js", "/api/unknown", "/webxr/"):
            with self.subTest(path=path):
                self.assertEqual(self.request("GET", path)[0], 404)
        self.assertEqual(self.request("POST", "/api/unknown", "{}")[0], 404)

    def test_symlink_escape_is_confined_when_supported(self):
        outside = Path(self.directory.name) / "secret.html"
        try:
            (self.root / "escape.html").symlink_to(outside)
        except (OSError, NotImplementedError):
            self.skipTest("Creating symlinks is not supported for this user")
        self.assertEqual(self.request("GET", "/escape.html")[0], 404)

    def test_close_stops_udp_listener_and_is_idempotent(self):
        self.relay.close()
        self.assertFalse(self.relay.worker.is_alive())
        self.relay.close()
        self.assertEqual(self.post(self.cue())[0], 503)


class ExternalOriginConfigurationTests(unittest.TestCase):
    INVALID_ORIGINS = (
        "", "http://tunnel.example", "https://", "https://*.example", "*",
        "https://user@tunnel.example", "https://user:password@tunnel.example",
        "https://tunnel.example/", "https://tunnel.example/path",
        "https://tunnel.example?query=1", "https://tunnel.example?",
        "https://tunnel.example#fragment", "https://tunnel.example#",
        " https://tunnel.example", "https://tunnel.example\n",
        "https://tunnel.example\\path", "https://TUNNEL.example", "HTTPS://tunnel.example",
        "https://tunnel.example:443", "https://tunnel.example:0", "https://tunnel.example:65536",
        "https://tunnel.example:notaport", "https://tunnel.example:",
        "https://bad_host.example", "https://-bad.example", "https://tunnel..example",
    )

    def test_canonical_origins_validate(self):
        for origin in ("https://tunnel.example", "https://tunnel.example:8443",
                       "https://127.0.0.1", "https://[::1]", "https://xn--example-9d0b.test"):
            with self.subTest(origin=origin):
                self.assertEqual(webxr_relay.validate_external_origin(origin), origin)

    def test_invalid_server_configuration_is_rejected_before_binding(self):
        for origin in self.INVALID_ORIGINS:
            with self.subTest(origin=origin), patch.object(webxr_relay, "RelayHTTPServer") as listener:
                with self.assertRaises(ValueError):
                    webxr_relay.create_server(None, port=0, external_origin=origin)
                listener.assert_not_called()

    def test_cli_rejects_invalid_origin_before_starting_any_relay(self):
        with patch.object(sys, "argv", ["webxr", "--external-origin", "https://*.example"]), \
                patch.object(webxr_relay, "Relay") as relay, patch("sys.stderr", new_callable=io.StringIO):
            with self.assertRaises(SystemExit) as error:
                webxr_relay.main()
            self.assertEqual(error.exception.code, 2)
            relay.assert_not_called()


if __name__ == "__main__":
    unittest.main()
