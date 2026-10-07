"""Package the browser prototype, monitor relay and their quickstart."""
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parents[1]
output = root / "artifacts" / "AHAM-WebXR-Starter.zip"
output.parent.mkdir(exist_ok=True)
paths = [root / "README.md", root / "docs/webxr-quickstart.md",
         root / "docs/webxr-architecture.md", root / "docs/protocol.md",
         root / "tests/test_webxr_relay.py", root / "tests/webxr-logic.test.mjs"]
for folder in ("webxr", "host"):
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
