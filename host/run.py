"""Run from the repository root: python host/run.py simulate (or bridge)."""
import sys

if len(sys.argv) < 2 or sys.argv[1] not in {"simulate", "bridge"}:
    raise SystemExit("Usage: python host/run.py simulate [options] | bridge --port COM5")
mode = sys.argv.pop(1)
if mode == "simulate":
    from aham.simulator import main
else:
    from aham.bridge import main
main()
