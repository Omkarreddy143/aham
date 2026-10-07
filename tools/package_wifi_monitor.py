"""Build a standalone PlatformIO receive-only project with no local secrets."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
output = root / "artifacts" / "AHAM-WiFi-Monitor.zip"
paths = ["firmware/src/wifi_monitor.cpp", "firmware/include/BoardConfig.h",
         "firmware/include/AhamProtocol.h", "firmware/include/WifiMonitor.h",
         "firmware/include/WifiSecrets.example.h", "host/run.py", "host/aham/__init__.py",
         "host/aham/protocol.py", "host/aham/wifi_monitor.py", "tests/test_wifi_monitor.py",
         "tests/wifi_monitor_tests.cpp", "tests/fixtures/wifi-monitor.txt", "docs/wifi-quickstart.md",
         "docs/servo-resistance-plan.md", "docs/webxr-quickstart.md"]
output.parent.mkdir(exist_ok=True)
with ZipFile(output, "w", ZIP_DEFLATED) as archive:
    for name in paths:
        archive.write(root/name, name)
    archive.writestr("firmware/platformio.ini", """[platformio]
default_envs = nodemcu_wifi_monitor

[env:nodemcu_wifi_monitor]
platform = espressif8266@4.2.1
board = nodemcuv2
framework = arduino
build_flags = -Wall -Wextra
build_src_filter = +<wifi_monitor.cpp>
monitor_speed = 115200
""")
    archive.writestr(".gitignore", "**/WifiSecrets.h\n.pio/\n.venv/\n__pycache__/\n*.pyc\n")
    archive.writestr("START-HERE.txt", "AHAM receive-only Wi-Fi monitor\n\n"
                     "Follow docs/wifi-quickstart.md. Open the firmware folder in VS Code/PlatformIO.\n"
                     "Copy the credential example to WifiSecrets.h and edit only that ignored copy.\n"
                     "The laptop sender uses the updated WebXR relay in the full AHAM repository; "
                     "this ZIP does not include the VR scene/server.\n"
                     "No motor or servo output is enabled. No actual credentials or compiled firmware are included.\n"
                     "https://github.com/Omkarreddy143/aham\n")
print(output)
