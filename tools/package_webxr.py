"""Package the browser prototype, monitor relay and their quickstart."""
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parents[1]
output = root / "artifacts" / "AHAM-WebXR-Starter.zip"
output.parent.mkdir(exist_ok=True)
paths = [root / "README.md", root / "docs/webxr-quickstart.md", root / "docs/final-demo-3min.md", root / "Open Final Demo.cmd",
         root / "Open VR Link.cmd", root / "Refresh VR Link.cmd", root / "tools/vr_link.py", root / "tools/generate_garden_voice.py",
         root / "tools/check_wireless.py", root / "tests/test_vr_link.py", root / "tests/test_wifi_discovery.py",
         root / "Check Orbit Foundry.cmd", root / "tools/orbit_status.py", root / "tests/test_orbit_status.py",
         root / "docs/orbit-connection-check.md",
         root / "Automatic VR Feedback.cmd", root / "docs/automatic-feedback.md", root / "tests/test_auto_feedback.py",
         root / "docs/technical-judging.md",
         root / "docs/webxr-architecture.md", root / "docs/protocol.md",
         root / "tests/test_webxr_relay.py", root / "tests/webxr-logic.test.mjs",
         root / "tests/webxr-game.test.mjs", root / "tests/webxr-network.test.mjs", root / "tests/webxr-feedback.test.mjs", root / "tests/webxr-witness.test.mjs", root / "tests/webxr-hands.test.mjs", root / "tests/webxr-garden-play.test.mjs", root / "docs/servo-resistance-plan.md",
         root / "docs/verification.md", root / "docs/images/webxr-v4.jpg"]
paths.extend([root / "docs/wifi-quickstart.md", root / "tests/test_wifi_monitor.py",
              root / "docs/usb-glove-quickstart.md", root / "tools/glove_command.py", root / "tools/servo_sweep.py",
              root / "tests/test_wifi_glove.py",
              root / "Enable Index Feedback.cmd", root / "Stop Glove.cmd", root / "tests/test_serial_glove.py",
              root / "docs/index-hardware-quickstart.md", root / "docs/five-finger-hardware.md",
              root / "docs/judging-preparation.md", root / "docs/judging-talk.md",
              root / "docs/tattva-explanation.md", root / "docs/judging-cards.html",
              root / "docs/judging-observations.csv"])
for folder in ("webxr", "host", "docs/images"):
    paths.extend(path for path in (root / folder).rglob("*")
                 if path.is_file() and "__pycache__" not in path.parts)
with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(set(paths)):
        archive.write(path, path.relative_to(root).as_posix())
    archive.writestr("START-HERE.txt", "AHAM WebXR monitor starter\n\n"
                     "Follow docs/webxr-quickstart.md. This ZIP includes the WebXR scene, "
                     "laptop monitor relay, optional USB bridge and their tests.\n"
                     "The README also links to legacy firmware/Unity files in the full repository; "
                     "those legacy files are not included here. No actuator output is enabled.\n"
                     "Full repository: https://github.com/Omkarreddy143/aham\n")
print(output)
