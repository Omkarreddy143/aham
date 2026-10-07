"""Hardware-free glove simulator. HTTP controls can NEVER reach real actuators."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import socket
import threading
import time

from .protocol import (Packet, TELEMETRY, CONTROL, HAPTIC, TELEMETRY_PAYLOAD, HAPTIC_PAYLOAD,
                       control, haptic, decode, telemetry)

WEB = Path(__file__).resolve().parents[1] / "web"
PROFILES = {"smooth": (100, 1), "rough": (150, 2), "soft": (80, 3)}


class SimulatedGlove:
    """Behavioral emulator; native tests separately exercise actual firmware supervision."""
    def __init__(self, controller="dashboard", command_port=8766, telemetry_port=8765):
        self.controller = controller
        self.lock = threading.RLock()
        self.curls = [0] * 5
        self.contacts = [False] * 5
        self.material = "rough"
        self.state = self.fault = 0
        self.open = self.closed = None
        self.stop_healthy = self.link_enabled = True
        self.desired = [0] * 5
        self.patterns = [0] * 5
        self.starts = [0] * 5
        self.refresh = 0
        self.lease = 100
        self.last_sequence = None
        self.host_sequence = self.tx_sequence = self.sent = self.received = self.errors = 0
        self.started = time.monotonic()
        self.last_command = ""
        self.last_telemetry = ""
        self.command_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.command_socket.bind(("127.0.0.1", command_port))
        self.command_socket.setblocking(False)
        self.sender = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.target = ("127.0.0.1", telemetry_port)
        self.done = threading.Event()

    def now(self):
        return int((time.monotonic() - self.started) * 1000)

    def raw(self):
        return [900 + int(1.8 * value) for value in self.curls]

    def calibrated(self):
        return self.open is not None and self.closed is not None and all(abs(a - b) >= 120 for a, b in zip(self.open, self.closed))

    def fail(self, code):
        self.state, self.fault, self.desired = 3, code, [0] * 5

    def accept(self, packet, now):
        with self.lock:
            fresh = self.last_sequence is None or 0 < ((packet.sequence - self.last_sequence) & 65535) < 32768
            if packet.kind == CONTROL:
                if len(packet.payload) != 1 or packet.payload[0] > 4:
                    return False
                action = packet.payload[0]
                if action == 0:
                    self.desired = [0] * 5
                    if self.state != 3:
                        self.state = 0
                    self.last_sequence = packet.sequence
                    return True
                if not fresh:
                    return False
                self.last_sequence = packet.sequence
                if action == 4 and self.stop_healthy:
                    self.state = self.fault = 0
                    self.desired = [0] * 5
                    return True
                if self.state == 3:
                    return False
                if action == 1:
                    if not self.calibrated() or not self.stop_healthy or self.state == 2:
                        return False
                    self.state, self.refresh, self.lease = 2, now, 100
                    return True
                if self.state == 2:
                    return False
                if action == 2:
                    self.open = self.raw()
                elif action == 3:
                    self.closed = self.raw()
                return True
            if packet.kind != HAPTIC or len(packet.payload) != 15 or not fresh:
                return False
            values = HAPTIC_PAYLOAD.unpack(packet.payload)
            if not 1 <= values[0] <= 100 or any(p > 3 for p in values[6:11]):
                return False
            if values[11] or values[12]:
                if self.state == 2:
                    self.fail(3)
                return False
            if self.state != 2 or not self.stop_healthy:
                return False
            self.last_sequence, self.refresh, self.lease = packet.sequence, now, values[0]
            for i in range(5):
                duty = min(values[1 + i], 160)
                if duty and not self.desired[i]:
                    self.starts[i] = now
                self.desired[i], self.patterns[i] = duty, values[6 + i]
            self.received += 1
            self.last_command = packet.encode().hex(" ")
            return True

    def command(self, action=None):
        seq = self.host_sequence
        self.host_sequence = (seq + 1) & 65535
        if action is not None:
            packet = control(seq, self.now(), action)
        else:
            duty, pattern = PROFILES[self.material]
            packet = haptic(seq, self.now(), [duty if c else 0 for c in self.contacts], [pattern] * 5)
        # Exercise framing and integrity validation in the simulator too.
        return self.accept(decode(packet.encode()), self.now())

    def tick(self, now):
        if self.state == 2 and not self.stop_healthy:
            self.fail(1)
        if self.state == 2 and now - self.refresh >= 150:
            self.fail(2)

    def outputs(self, now):
        if self.state != 2 or now - self.refresh >= self.lease:
            return [0] * 5
        result = []
        for duty, pattern, start in zip(self.desired, self.patterns, self.starts):
            elapsed = now - start
            if elapsed >= 2000 or (pattern == 1 and elapsed % 200 >= 60):
                duty = 0
            elif pattern == 2 and elapsed % 80 >= 35:
                duty //= 3
            elif pattern == 3:
                duty //= 2
            result.append(duty)
        return result

    def packet(self, now, advance=True):
        flags = (1 if self.calibrated() else 0) | (2 if self.stop_healthy else 0) | 4 | 32
        if self.state == 2 and now - self.refresh >= self.lease:
            flags |= 8
        if any(d and now - start >= 2000 for d, start in zip(self.desired, self.starts)):
            flags |= 16
        mapped = [0] * 5
        if self.calibrated():
            mapped = [max(0, min(1000, int((r - a) * 1000 / (b - a)))) for r, a, b in zip(self.raw(), self.open, self.closed)]
        payload = TELEMETRY_PAYLOAD.pack(self.state, flags, self.fault, *mapped, *self.raw(), 0, *self.outputs(now), 1 | (31 << 2) | (31 << 7))
        result = Packet(TELEMETRY, self.tx_sequence, now, payload)
        if advance:
            self.tx_sequence = (self.tx_sequence + 1) & 65535
        return result

    def snapshot(self):
        with self.lock:
            packet = self.packet(self.now(), advance=False)
            return dict(**telemetry(packet), input_curls=self.curls[:], contacts=self.contacts[:],
                        material=self.material, controller=self.controller, simulated=True,
                        stop_healthy=self.stop_healthy, link_enabled=self.link_enabled,
                        sent=self.sent, received=self.received, errors=self.errors,
                        command_hex=self.last_command, telemetry_hex=self.last_telemetry)

    def action(self, body):
        with self.lock:
            action = body.get("action")
            if action == "curls":
                values = body.get("values")
                if not isinstance(values, list) or len(values) != 5 or any(type(x) is not int or not 0 <= x <= 1000 for x in values):
                    raise ValueError("Five integer curls from 0 to 1000 are required")
                self.curls = values
            elif action == "material":
                if body.get("value") not in PROFILES:
                    raise ValueError("Unknown material")
                self.material = body["value"]
            elif action == "contacts":
                values = body.get("values")
                if not isinstance(values, list) or len(values) != 5 or any(type(x) is not bool for x in values):
                    raise ValueError("Five contact booleans are required")
                self.contacts = values
            elif action in ("stop", "link"):
                if type(body.get("value")) is not bool:
                    raise ValueError("Boolean value required")
                if action == "stop":
                    self.stop_healthy = body["value"]
                    self.tick(self.now())
                else:
                    self.link_enabled = body["value"]
            elif action in {"disarm", "arm", "open", "closed", "clear"}:
                if self.controller != "dashboard":
                    raise ValueError("Use Unity to calibrate/arm when Unity is the selected controller")
                if not self.command({"disarm": 0, "arm": 1, "open": 2, "closed": 3, "clear": 4}[action]):
                    raise ValueError("Command refused; check calibration, stop and fault state")
            else:
                raise ValueError("Unknown action")

    def run(self):
        last_command = -20
        deadline = time.monotonic()
        while not self.done.is_set():
            with self.lock:
                now = self.now()
                for _ in range(16):
                    try:
                        frame, sender = self.command_socket.recvfrom(256)
                    except BlockingIOError:
                        break
                    if sender[0] != "127.0.0.1" or self.controller != "unity" or not self.link_enabled:
                        continue
                    try:
                        if not self.accept(decode(frame), now):
                            self.errors += 1
                    except ValueError:
                        self.errors += 1
                if self.controller == "dashboard" and self.state == 2 and self.link_enabled and now - last_command >= 20:
                    self.command()
                    last_command = now
                self.tick(now)
                frame = self.packet(now).encode()
                self.last_telemetry = frame.hex(" ")
                self.sender.sendto(frame, self.target)
                self.sent += 1
            deadline += .01
            if time.monotonic() > deadline + .1:
                deadline = time.monotonic()
            self.done.wait(max(0, deadline - time.monotonic()))

    def close(self):
        self.done.set()
        self.command_socket.close()
        self.sender.close()


def create_server(glove, port=8870):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def respond(self, status, body, mime="application/json"):
            self.send_response(status)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path == "/api/state":
                self.respond(200, json.dumps(glove.snapshot()).encode())
                return
            files = {"/": ("index.html", "text/html; charset=utf-8"),
                     "/app.js": ("app.js", "text/javascript"), "/style.css": ("style.css", "text/css")}
            if self.path not in files:
                self.respond(404, b'{"error":"Not found"}')
                return
            name, mime = files[self.path]
            self.respond(200, (WEB / name).read_bytes(), mime)

        def do_POST(self):
            expected_hosts = {f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}"}
            host = self.headers.get("Host", "")
            origin = self.headers.get("Origin")
            if host not in expected_hosts or (origin and origin != "http://" + host):
                self.respond(403, b'{"error":"Only same-origin localhost controls are allowed"}')
                return
            if self.path != "/api/action" or self.headers.get("Content-Type") != "application/json":
                self.respond(400, b'{"error":"Use JSON /api/action"}')
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= 4096:
                    raise ValueError("Invalid body size")
                body = json.loads(self.rfile.read(length))
                if not isinstance(body, dict):
                    raise ValueError("JSON object required")
                glove.action(body)
                self.respond(200, json.dumps(glove.snapshot()).encode())
            except (ValueError, TypeError) as error:
                self.respond(400, json.dumps({"error": str(error)}).encode())
    return ThreadingHTTPServer(("127.0.0.1", port), Handler)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--controller", choices=["dashboard", "unity"], default="dashboard")
    parser.add_argument("--web-port", type=int, default=8870)
    parser.add_argument("--command-port", type=int, default=8766)
    parser.add_argument("--telemetry-port", type=int, default=8765)
    args = parser.parse_args()
    glove = SimulatedGlove(args.controller, args.command_port, args.telemetry_port)
    server = create_server(glove, args.web_port)
    worker = threading.Thread(target=glove.run, daemon=True)
    worker.start()
    print(f"AHAM SIMULATION ONLY: http://127.0.0.1:{server.server_port} | controller={args.controller}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        glove.done.set()
        worker.join(timeout=1)
        glove.close()
        server.server_close()


if __name__ == "__main__":
    main()
