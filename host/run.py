"""Run the simulator, USB bridge, or WebXR monitor from the repository root."""
import sys

if len(sys.argv) < 2 or sys.argv[1] not in {"simulate", "bridge", "webxr"}:
    raise SystemExit("Usage: python host/run.py simulate | bridge --port COM7 | webxr [options]")
mode = sys.argv.pop(1)
if mode == "simulate":
    from aham.simulator import main
elif mode == "bridge":
    from aham.bridge import main
else:
    from aham.webxr_relay import main
main()
