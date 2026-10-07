"""Serve the WebXR prototype and relay cues to the localhost monitor only.

Run from the repository root with ``python -m aham.webxr_relay`` after adding
``host`` to PYTHONPATH, or through ``python host/run.py webxr``. This module
has no serial transport and never sends packets to the actuator command port.
"""
import argparse
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import ipaddress
import json
from pathlib import Path
import re
import socket
import ssl
import threading
import time
from urllib.parse import unquote, urlsplit

from .cue_monitor import cue_values
from .protocol import HAPTIC, TELEMETRY, decode, haptic, telemetry


WEB = Path(__file__).resolve().parents[2] / "webxr"
MONITOR_ADDRESS = ("127.0.0.1", 8767)
MAX_CUE_BYTES = 4096
RECEIVED_MAX_AGE = 0.500
BOARD_MAX_AGE = 0.200
MAX_RECENT_CUES = 32
CUE_FIELDS = {"version", "source", "hand", "trackingValid", "duties", "patterns"}
GRIP_FIELDS = {"version", "source", "hand", "trackingValid", "holding", "objectId",
               "gripMode", "resistance", "referenceCurl"}
STATIC_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
}


def validate_external_origin(value):
    """Require one canonical HTTPS origin, never a URL or wildcard pattern."""
    message = "external origin must be a canonical HTTPS origin without credentials, path, query, fragment, or wildcard"
    if (not isinstance(value, str) or not value
            or any(ord(character) <= 32 or ord(character) >= 127 for character in value)
            or "*" in value or "\\" in value):
        raise ValueError(message)
    try:
        parsed = urlsplit(value)
        host, port = parsed.hostname, parsed.port
        if (parsed.scheme != "https" or not host or parsed.username is not None
                or parsed.password is not None or parsed.path or parsed.query or parsed.fragment
                or "?" in value or "#" in value or port is not None and not 1 <= port <= 65535):
            raise ValueError(message)
        if ":" in host:
            authority = f"[{ipaddress.IPv6Address(host).compressed}]"
        elif all(character in "0123456789." for character in host):
            authority = str(ipaddress.IPv4Address(host))
        else:
            if (len(host) > 253 or any(
                    not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label)
                    for label in host.split("."))):
                raise ValueError(message)
            authority = host
        if port is not None and port != 443:
            authority += f":{port}"
        if value != f"https://{authority}":
            raise ValueError(message)
    except ValueError:
        raise ValueError(message) from None
    return value


def validate_cue(value):
    """Validate the entire request before applying the preview/tracking fail-safe."""
    if not isinstance(value, dict) or set(value) != CUE_FIELDS:
        raise ValueError("Expected exactly the documented cue fields")
    if type(value["version"]) is not int or value["version"] != 1:
        raise ValueError("version must be 1")
    if value["source"] not in ("webxr", "desktop-preview"):
        raise ValueError("Invalid source")
    if value["hand"] not in ("right", "left"):
        raise ValueError("Invalid hand")
    if type(value["trackingValid"]) is not bool:
        raise ValueError("trackingValid must be a boolean")
    for name, maximum in (("duties", 160), ("patterns", 3)):
        channel_values = value[name]
        if (not isinstance(channel_values, list) or len(channel_values) != 5
                or any(type(item) is not int or not 0 <= item <= maximum
                       for item in channel_values)):
            raise ValueError(f"{name} must contain five integers from 0 to {maximum}")
    if value["source"] != "webxr" or not value["trackingValid"]:
        return [0] * 5, [0] * 5
    return list(value["duties"]), list(value["patterns"])


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON field")
        result[key] = value
    return result


def validate_grip_preview(value):
    """An expiring software preview; this is never encoded into board packets."""
    if not isinstance(value, dict) or set(value) != GRIP_FIELDS:
        raise ValueError("Expected exactly the documented grip-preview fields")
    if type(value["version"]) is not int or value["version"] != 1:
        raise ValueError("version must be 1")
    if value["source"] not in ("webxr", "desktop-preview") or value["hand"] != "right":
        raise ValueError("Grip preview requires a known source and right hand")
    if type(value["trackingValid"]) is not bool or type(value["holding"]) is not bool:
        raise ValueError("trackingValid and holding must be booleans")
    if value["objectId"] not in (None, "mint", "amber", "violet"):
        raise ValueError("Unknown core")
    if value["gripMode"] not in ("none", "pinch", "grip"):
        raise ValueError("Unknown grip mode")
    for name, maximum in (("resistance", 80), ("referenceCurl", 100)):
        if (not isinstance(value[name], list) or len(value[name]) != 5
                or any(type(item) is not int or not 0 <= item <= maximum for item in value[name])):
            raise ValueError(f"{name} must contain five integers from 0 to {maximum}")
    if value["holding"] and (value["objectId"] is None or value["gripMode"] == "none"):
        raise ValueError("A holding preview requires a core and grip mode")
    result = dict(value, resistance=list(value["resistance"]), referenceCurl=list(value["referenceCurl"]))
    if value["source"] != "webxr" or not value["trackingValid"] or not value["holding"]:
        result.update(holding=False, objectId=None, gripMode="none", resistance=[0]*5, referenceCurl=[0]*5)
    result["actuatorsEnabled"] = False
    return result


def _reject_constant(value):
    raise ValueError("Non-finite JSON number")


class Relay:
    """Keep actual UDP receipts separate from HTTP cue acceptance."""

    def __init__(self, telemetry_port=8877):
        self.lock = threading.Lock()
        self.done = threading.Event()
        self.sequence = 0
        self.recent_cues = deque(maxlen=MAX_RECENT_CUES)
        self.received = self.board = None
        self.received_at = self.board_at = None
        self.resistance = None
        self.resistance_at = None
        self.grip_sequence = 0
        self.submitted = None
        self.submitted_at = None
        self.listener = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sender = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            self.listener.bind(("127.0.0.1", telemetry_port))
            self.listener.settimeout(0.050)
        except OSError:
            self.listener.close()
            self.sender.close()
            raise
        self.telemetry_port = self.listener.getsockname()[1]
        self.worker = threading.Thread(target=self._receive, name="AHAM-WebXR-monitor", daemon=True)
        self.worker.start()

    def submit(self, value):
        duties, patterns = validate_cue(value)
        with self.lock:
            if self.done.is_set():
                raise OSError("Monitor relay is closed")
            sequence = self.sequence
            sent_at = time.monotonic()
            self._prune_recent_cues(sent_at)
            frame = haptic(sequence, int(sent_at * 1000), duties, patterns).encode()
            # Register before sending so even an immediate echo can be correlated.
            self.recent_cues.append((sent_at, frame))
            # This is the sole outbound route; 8767 is the observation-only receiver.
            try:
                self.sender.sendto(frame, MONITOR_ADDRESS)
            except OSError:
                self.recent_cues.pop()
                raise
            self.sequence = (sequence + 1) & 0xFFFF
            self.submitted = dict(source=value["source"], hand=value["hand"], trackingValid=value["trackingValid"],
                                  duties=duties, patterns=patterns, sequence=sequence)
            self.submitted_at = sent_at
        return sequence

    def _prune_recent_cues(self, now):
        """Called with the state lock held; old submissions cannot confirm receipt."""
        while self.recent_cues and now - self.recent_cues[0][0] > RECEIVED_MAX_AGE:
            self.recent_cues.popleft()

    def submit_grip_preview(self, value):
        preview = validate_grip_preview(value)
        with self.lock:
            if self.done.is_set():
                raise OSError("Relay closed")
            sequence = self.grip_sequence
            self.grip_sequence = (sequence + 1) & 0xFFFF
            self.resistance = dict(preview, sequence=sequence)
            self.resistance_at = time.monotonic()
        return sequence

    def _receive(self):
        while not self.done.is_set():
            try:
                frame, address = self.listener.recvfrom(256)
            except socket.timeout:
                continue
            except OSError:
                return
            received_at = time.monotonic()
            if address[0] != "127.0.0.1":
                continue
            try:
                packet = decode(frame)
                if packet.kind == TELEMETRY:
                    values = telemetry(packet)
                    field, timestamp = "board", "board_at"
                elif packet.kind == HAPTIC:
                    values = cue_values(packet)
                    values["sequence"] = packet.sequence
                    field, timestamp = "received", "received_at"
                else:
                    continue
            except ValueError:
                continue
            with self.lock:
                if packet.kind == HAPTIC:
                    self._prune_recent_cues(received_at)
                    # Other apps share the monitor port. Matching duty/sequence
                    # alone cannot distinguish their cues from this relay's cues.
                    if not any(frame == submitted_frame and 0 <= received_at - sent_at <= RECEIVED_MAX_AGE
                               for sent_at, submitted_frame in self.recent_cues):
                        continue
                setattr(self, field, values)
                setattr(self, timestamp, received_at)

    def status(self):
        with self.lock:
            now = time.monotonic()
            self._prune_recent_cues(now)
            result = {"mode": "monitor-only", "received": None, "board": None, "resistance": None}
            for field, timestamp, maximum in (
                ("received", self.received_at, RECEIVED_MAX_AGE),
                ("board", self.board_at, BOARD_MAX_AGE),
                ("resistance", self.resistance_at, RECEIVED_MAX_AGE),
            ):
                if timestamp is not None and 0 <= now - timestamp < maximum:
                    result[field] = dict(getattr(self, field), ageMs=int((now - timestamp) * 1000))
            return result

    def close(self):
        self.done.set()
        self.listener.close()
        self.worker.join(timeout=1)
        with self.lock:
            self.sender.close()

    def wifi_preview(self):
        """Accepted data for the receive-only LAN companion, separate from receipts."""
        with self.lock:
            now = time.monotonic()
            cue = (dict(self.submitted, ageMs=int((now-self.submitted_at)*1000))
                   if self.submitted_at is not None and 0 <= now-self.submitted_at < .250 else None)
            grip = (dict(self.resistance, ageMs=int((now-self.resistance_at)*1000))
                    if self.resistance_at is not None and 0 <= now-self.resistance_at < .500 else None)
            return {"mode": "monitor-only", "cue": cue, "grip": grip}


class RelayHTTPServer(ThreadingHTTPServer):
    daemon_threads = True


class RelayHandler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(2)

    def log_message(self, format, *args):
        pass

    def _reply(self, status, content, content_type="application/json; charset=utf-8"):
        if isinstance(content, dict):
            content = json.dumps(content, allow_nan=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Connection", "close")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(content)
        self.close_connection = True

    def _same_origin(self):
        origins = self.headers.get_all("Origin", [])
        hosts = self.headers.get_all("Host", [])
        if origins and (len(origins) != 1 or len(hosts) != 1
                        or origins[0] not in (f"{self.server.scheme}://{hosts[0]}",
                                              self.server.external_origin)):
            self._reply(403, {"error": "Same-origin requests required"})
            return False
        return True

    def do_GET(self):
        try:
            path = urlsplit(self.path).path
        except ValueError:
            self._reply(400, {"error": "Invalid path"})
            return
        if path.startswith("/api/"):
            if not self._same_origin():
                return
            if path == "/api/status":
                self._reply(200, self.server.relay.status())
            elif path == "/api/wifi-preview":
                self._reply(200, self.server.relay.wifi_preview())
            else:
                self._reply(404, {"error": "Unknown endpoint"})
            return
        decoded = unquote(path)
        if (not decoded.startswith("/") or "\\" in decoded or ":" in decoded
                or "\0" in decoded or ".." in decoded.split("/")):
            self._reply(404, {"error": "Unknown file"})
            return
        relative = "index.html" if decoded == "/" else decoded.lstrip("/")
        try:
            target = (self.server.static_root / relative).resolve()
            target.relative_to(self.server.static_root)
            content_type = STATIC_TYPES.get(target.suffix.lower())
            if content_type is None or not target.is_file():
                raise ValueError("Unknown file")
            content = target.read_bytes()
        except (ValueError, OSError):
            self._reply(404, {"error": "Unknown file"})
            return
        self._reply(200, content, content_type)

    do_HEAD = do_GET

    def do_POST(self):
        try:
            path = urlsplit(self.path).path
        except ValueError:
            self._reply(400, {"error": "Invalid path"})
            return
        if path not in ("/api/cue", "/api/grip-preview"):
            self._reply(404, {"error": "Unknown endpoint"})
            return
        if not self._same_origin():
            return
        content_types = self.headers.get_all("Content-Type", [])
        lengths = self.headers.get_all("Content-Length", [])
        try:
            if (len(content_types) != 1
                    or content_types[0].split(";", 1)[0].strip().lower() != "application/json"):
                raise ValueError("Content-Type must be application/json")
            if self.headers.get_all("Transfer-Encoding") or len(lengths) != 1:
                raise ValueError("A single Content-Length is required")
            if not lengths[0].isascii() or not lengths[0].isdigit():
                raise ValueError("Invalid Content-Length")
            length = int(lengths[0])
            if not 0 < length <= MAX_CUE_BYTES:
                raise ValueError("Cue body must contain 1 to 4096 bytes")
            body = self.rfile.read(length)
            if len(body) != length:
                raise ValueError("Incomplete cue body")
            value = json.loads(body.decode("utf-8"), object_pairs_hook=_unique_object,
                               parse_constant=_reject_constant)
            sequence = (self.server.relay.submit(value) if path == "/api/cue"
                        else self.server.relay.submit_grip_preview(value))
        except (ValueError, UnicodeError, RecursionError) as error:
            self._reply(400, {"error": str(error)})
            return
        except OSError:
            self._reply(503, {"error": "Monitor relay unavailable"})
            return
        result = {"accepted": True, "monitorOnly": True, "sequence": sequence}
        if path == "/api/grip-preview":
            result["actuatorsEnabled"] = False
        self._reply(200, result)


def create_server(relay, port=8890, bind="127.0.0.1", static_root=None, scheme="http", external_origin=None):
    if scheme not in ("http", "https"):
        raise ValueError("Invalid URL scheme")
    if external_origin is not None:
        external_origin = validate_external_origin(external_origin)
    server = RelayHTTPServer((bind, port), RelayHandler)
    server.relay = relay
    server.static_root = Path(WEB if static_root is None else static_root).resolve()
    server.scheme = scheme
    server.external_origin = external_origin
    return server


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bind", default="127.0.0.1", help="HTTP bind address")
    parser.add_argument("--port", type=int, default=8890, help="HTTP/HTTPS port")
    parser.add_argument("--telemetry-port", type=int, default=8877, help="Loopback monitor/board receipt port")
    parser.add_argument("--cert", help="PEM certificate for optional HTTPS")
    parser.add_argument("--key", help="PEM private key for optional HTTPS")
    parser.add_argument("--external-origin", type=validate_external_origin,
                        help="Exact HTTPS origin of a reverse TLS tunnel, e.g. https://example.trycloudflare.com")
    args = parser.parse_args()
    if bool(args.cert) != bool(args.key):
        parser.error("--cert and --key must be provided together")
    if not 0 <= args.port <= 65535 or not 0 <= args.telemetry_port <= 65535:
        parser.error("Ports must be between 0 and 65535")
    scheme = "https" if args.cert else "http"
    context = None
    if args.cert:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(args.cert, args.key)
    relay = Relay(args.telemetry_port)
    server = None
    try:
        server = create_server(relay, args.port, args.bind, scheme=scheme, external_origin=args.external_origin)
        if context:
            server.socket = context.wrap_socket(server.socket, server_side=True)
        print(f"AHAM WebXR monitor: {scheme}://127.0.0.1:{server.server_port}/", flush=True)
        print("MONITOR ONLY: cues go to localhost:8767; no actuator or serial output.", flush=True)
        print("Companion bridge (start separately after verifying COM7):", flush=True)
        print(f"python host/run.py bridge --port COM7 --stats --cue-monitor --telemetry-port {relay.telemetry_port}", flush=True)
        if not context:
            print(f"Quest USB secure context: adb reverse tcp:{server.server_port} tcp:{server.server_port}; "
                  f"open http://localhost:{server.server_port}/ in Quest Browser.", flush=True)
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        if server:
            server.server_close()
        relay.close()


if __name__ == "__main__":
    main()
