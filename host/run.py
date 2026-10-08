"""Run the simulator, USB bridge, or WebXR monitor from the repository root."""
import sys

if len(sys.argv) < 2 or sys.argv[1] not in {"simulate", "bridge", "webxr", "wifi-monitor", "wifi-bench", "wifi-glove", "glove-test"}:
    raise SystemExit("Usage: python host/run.py simulate | bridge --port COM7 | webxr | wifi-monitor --esp-ip IP | wifi-bench --esp-ip IP --key-file PATH | wifi-glove --esp-ip IP --key-file PATH | glove-test --esp-ip IP --key-file PATH")
mode = sys.argv.pop(1)
if mode == "simulate":
    from aham.simulator import main
elif mode == "bridge":
    from aham.bridge import main
elif mode == "wifi-monitor":
    from aham.wifi_monitor import main
elif mode == "wifi-bench":
    from aham.wifi_bench import main
elif mode == "wifi-glove":
    from aham.wifi_glove import main
elif mode == "glove-test":
    from aham.glove_test import main
else:
    from aham.webxr_relay import main
main()
