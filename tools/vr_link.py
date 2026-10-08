"""One-click Windows recovery of the AHAM HTTPS tunnel and matching relay origin."""
import argparse
from contextlib import contextmanager
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from urllib.request import ProxyHandler, build_opener
import uuid
import webbrowser

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / ".build"
STATE = BUILD / "quest-wireless.json"
PYTHON = ROOT / ".venv/Scripts/python.exe"
TUNNEL = BUILD / "cloudflared.exe"
sys.path.insert(0, str(ROOT / "host"))
from aham.webxr_relay import validate_external_origin
from aham.wifi_monitor import NoRedirect

URL_PATTERN = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com(?![a-z0-9.-])")


def quick_origin(log):
    match = URL_PATTERN.search(log)
    return validate_external_origin(match.group()) if match else None


def load_state():
    if not STATE.exists():
        return {"httpPort": 8890, "telemetryPort": 8877, "mode": "monitor-only"}
    value = json.loads(STATE.read_text(encoding="utf-8-sig"))
    if not isinstance(value, dict) or value.get("httpPort", 8890) != 8890:
        raise ValueError("This shortcut manages only the AHAM relay on port 8890")
    if value.get("origin"):
        validate_external_origin(value["origin"])
    return value


def save_state(value):
    # Preserve ESP addresses and sender settings; no firmware/key fields are changed.
    for target in (STATE, BUILD / "quest-restore.json"):
        temporary = target.with_suffix(".tmp")
        temporary.write_text(json.dumps(value, indent=2)+"\n", encoding="utf-8")
        temporary.replace(target)
    for name, field in (("quest-tunnel.pid", "tunnelPid"), ("webxr-server.pid", "serverPid")):
        if value.get(field):
            (BUILD / name).write_text(str(value[field])+"\n", encoding="ascii")


def health(origin, timeout=3):
    try:
        with build_opener(ProxyHandler({}), NoRedirect()).open(origin+"/api/status", timeout=timeout) as reply:
            body = reply.read(8193)
            if len(body) > 8192:
                return False
            value = json.loads(body)
            return reply.status == 200 and isinstance(value, dict) and value.get("mode") == "monitor-only"
    except (OSError, ValueError, RecursionError):
        return False


def process_table():
    command = ("@(Get-CimInstance Win32_Process | Where-Object { $_.Name -in "
               "@('python.exe','cloudflared.exe') } | Select-Object ProcessId,ParentProcessId,"
               "Name,ExecutablePath,CommandLine) | ConvertTo-Json -Compress -Depth 3")
    result = subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", command],
                            capture_output=True, text=True, check=True,
                            creationflags=subprocess.CREATE_NO_WINDOW, timeout=15)
    values = json.loads(result.stdout or "[]")
    return values if isinstance(values, list) else [values]


def managed(record, kind, origin=None, parent=None):
    """Validate identity before using a saved PID; PID reuse must never kill another app."""
    command = (record.get("CommandLine") or "").replace("\\", "/").lower()
    executable = (record.get("ExecutablePath") or "").replace("\\", "/").lower()
    if kind == "tunnel":
        return (record.get("Name") == "cloudflared.exe" and executable == TUNNEL.as_posix().lower()
                and re.search(r'\btunnel\b', command) is not None
                and re.search(r'--url\s+"?http://127\.0\.0\.1:8890(?:"|\s|$)', command) is not None)
    if record.get("Name") != "python.exe" or not origin:
        return False
    full_script = (ROOT / "host/run.py").as_posix().lower()
    relative = "host/run.py" in command and executable == PYTHON.as_posix().lower()
    child = parent is not None and record.get("ParentProcessId") == parent and "host/run.py" in command
    return ((full_script in command or relative or child)
            and re.search(r'\bwebxr\s+--external-origin\s+"?'+re.escape(origin.lower())+r'(?:"|\s|$)', command) is not None)


def stop_managed(settings, kinds=("server", "tunnel")):
    records = process_table()
    for kind in kinds:
        owner = settings.get("serverPid" if kind == "server" else "tunnelPid")
        if not owner:
            continue
        root = next((record for record in records if record["ProcessId"] == owner), None)
        if root is None:
            continue
        if not managed(root, kind, settings.get("origin")):
            raise RuntimeError(f"Saved {kind} PID belongs to another process; it was left running")
        children = [record for record in records
                    if kind == "server" and managed(record, kind, settings.get("origin"), owner)
                    and record.get("ParentProcessId") == owner]
        # A venv wrapper can exit by itself as soon as its child stops. Ignore
        # already-exited processes, and recheck identity immediately before each
        # stop so a reused PID cannot affect an unrelated application.
        command = """$ErrorActionPreference='Stop'
        $records=([Console]::In.ReadToEnd() | ConvertFrom-Json)
        foreach ($expected in $records) {
            $current=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$expected.ProcessId)
            if (-not $current) { continue }
            if ($current.CommandLine -cne $expected.CommandLine -or $current.ExecutablePath -cne $expected.ExecutablePath) {
                throw 'Process identity changed; it was left running.'
            }
            Stop-Process -Id ([int]$expected.ProcessId) -Force
        }"""
        subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", command],
                       input=json.dumps([*children, root]), text=True, check=True,
                       creationflags=subprocess.CREATE_NO_WINDOW, timeout=15)


def spawn(arguments, log, error):
    with Path(log).open("wb") as output, Path(error).open("wb") as errors:
        return subprocess.Popen([str(argument) for argument in arguments], cwd=ROOT,
                                stdin=subprocess.DEVNULL, stdout=output, stderr=errors,
                                close_fds=True, creationflags=subprocess.CREATE_NO_WINDOW)


@contextmanager
def single_refresh():
    import msvcrt
    BUILD.mkdir(exist_ok=True)
    with (BUILD / "vr-link.lock").open("a+b") as lock:
        if not lock.tell():
            lock.write(b"0"); lock.flush()
        lock.seek(0)
        try:
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError:
            raise RuntimeError("A link refresh is already running. Wait for that window to finish.") from None
        try:
            yield
        finally:
            lock.seek(0); msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)


def refresh(settings, force=False):
    origin = settings.get("origin")
    if not force and origin and health("http://127.0.0.1:8890", 1) and health(origin):
        print("The existing link is working; keeping its address.", flush=True)
        return origin
    if not PYTHON.is_file() or not TUNNEL.is_file():
        raise RuntimeError("The .venv Python environment or .build/cloudflared.exe is missing; follow the WebXR quickstart.")
    # Keep the old local server available during tunnel creation. Only its exact
    # saved origin is stopped later, after the new public address is registered.
    stop_managed(settings, ("tunnel",))
    stamp = uuid.uuid4().hex[:8]
    log, error = BUILD / f"quest-shortcut-{stamp}.log", BUILD / f"quest-shortcut-{stamp}.err"
    print("Creating a new secure VR link...", flush=True)
    tunnel = spawn([TUNNEL, "tunnel", "--url", "http://127.0.0.1:8890", "--protocol", "http2",
                    "--edge-ip-version", "4", "--no-autoupdate"], log, error)
    settings.update(tunnelPid=tunnel.pid, tunnelLog=str(log), tunnelError=str(error), linkStatus="starting")
    save_state(settings)
    deadline = time.monotonic()+60
    new_origin = None
    while time.monotonic() < deadline:
        text = error.read_text(encoding="utf-8", errors="replace")
        new_origin = quick_origin(text)
        if new_origin and "Registered tunnel connection" in text:
            break
        if tunnel.poll() is not None:
            raise RuntimeError(f"Tunnel could not connect. Check Internet access; details: {error}")
        time.sleep(.25)
    else:
        raise RuntimeError(f"Tunnel registration took too long. Check Internet access; details: {error}")
    print("Updating the laptop relay to match that address...", flush=True)
    stop_managed(settings, ("server",))
    server_log, server_error = BUILD / f"vr-shortcut-{stamp}.log", BUILD / f"vr-shortcut-{stamp}.err"
    server = spawn([PYTHON, "-u", ROOT / "host/run.py", "webxr", "--external-origin", new_origin,
                    "--telemetry-port", str(settings.get("telemetryPort", 8877))], server_log, server_error)
    settings.update(origin=new_origin, serverPid=server.pid, serverLog=str(server_log), serverError=str(server_error))
    save_state(settings)
    deadline = time.monotonic()+30
    while time.monotonic() < deadline:
        if server.poll() is not None:
            raise RuntimeError(f"Relay did not start. Details: {server_error}")
        if health("http://127.0.0.1:8890", 1) and health(new_origin):
            settings.update(linkStatus="verified", verifiedAt=time.time())
            save_state(settings)
            return new_origin
        time.sleep(.5)
    raise RuntimeError("The relay started but the public link is not reachable yet. Keep Internet connected and run the shortcut again.")


def show_link(origin, open_browser=True, copy=True):
    url = origin+"/"
    (ROOT / "VR-LINK.txt").write_text(url+"\n\nOpen this address in Quest Browser, then Enter VR.\n", encoding="utf-8")
    print("\nREADY: "+url, flush=True)
    if copy:
        try:
            subprocess.run(["clip.exe"], input=url.encode("utf-16-le"), check=True, timeout=5,
                           creationflags=subprocess.CREATE_NO_WINDOW)
            print("Copied to clipboard and saved in VR-LINK.txt.", flush=True)
        except (OSError, subprocess.SubprocessError):
            print("Saved in VR-LINK.txt; copy the address shown above.", flush=True)
    if open_browser:
        webbrowser.open(url)
    print("On Quest: close old AHAM tabs, open this address, then Enter VR.\n"
          "ESP firmware and hotspot settings were not changed.", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="Generate a new URL even when the existing one works")
    parser.add_argument("--status", action="store_true", help="Check only; do not stop/start services")
    parser.add_argument("--no-open", action="store_true")
    parser.add_argument("--no-copy", action="store_true")
    args = parser.parse_args()
    if os.name != "nt":
        parser.error("This shortcut is for Windows")
    try:
        with single_refresh():
            settings = load_state()
            if args.status:
                local = health("http://127.0.0.1:8890", 1)
                public = bool(settings.get("origin") and health(settings["origin"]))
                print(json.dumps({"localRelay": local, "publicLink": public, "url": settings.get("origin")}))
                return 0 if local and public else 1
            origin = refresh(settings, args.force)
            show_link(origin, not args.no_open, not args.no_copy)
        return 0
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        print("\nLINK NOT READY: "+str(error), file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
