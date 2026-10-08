"""Package the one-index bench project without local keys, flags or credentials."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
output = root / "artifacts/AHAM-Index-Hardware.zip"
paths = ["firmware/src/wifi_bench.cpp", "firmware/include/BoardConfig.h",
         "firmware/include/AhamProtocol.h", "firmware/include/BenchController.h",
         "firmware/include/BenchAuth.h", "firmware/include/BenchConfig.example.h",
         "firmware/include/WifiSecrets.example.h", "host/run.py", "host/aham/__init__.py",
         "host/aham/protocol.py", "host/aham/wifi_monitor.py", "host/aham/wifi_bench.py",
         "tools/setup_wifi_bench.py", "tests/test_wifi_bench.py", "tests/test_wifi_monitor.py",
         "tests/wifi_bench_tests.cpp", "tests/fixtures/wifi-bench.txt",
         "docs/index-hardware-quickstart.md", "docs/wifi-quickstart.md",
         "docs/servo-resistance-plan.md", "docs/five-finger-hardware.md",
         "firmware/include/GloveConfig.example.h"]
output.parent.mkdir(exist_ok=True)
with ZipFile(output, "w", ZIP_DEFLATED) as archive:
    for name in paths:
        archive.write(root/name, name)
    archive.writestr("firmware/platformio.ini", """[platformio]
default_envs = nodemcu_wifi_bench

[env:nodemcu_wifi_bench]
platform = espressif8266@4.2.1
board = nodemcuv2
framework = arduino
build_flags = -Wall -Wextra
build_src_filter = +<wifi_bench.cpp>
monitor_speed = 115200
""")
    archive.writestr(".gitignore", "**/WifiSecrets.h\n**/BenchSecrets.h\n**/BenchConfig.h\n*.key\nlocal-data/\n.pio/\n.venv/\n__pycache__/\n*.pyc\n")
    archive.writestr("START-HERE.txt", "AHAM one-index hardware bench test\n\n"
                     "Read docs/index-hardware-quickstart.md. Existing VR website/server stays unchanged.\n"
                     "Open firmware in VS Code/PlatformIO; choose nodemcu_wifi_bench.\n"
                     "From the root run python tools/setup_wifi_bench.py and configure local Wi-Fi.\n"
                     "Defaults disable outputs. Enable only a completed circuit, then arm locally.\n"
                     "Servo: separate 5 V V+, NodeMCU 3 V VCC; tendon DETACHED for initial tests.\n"
                     "Motor: suitable separate 3 V power, NPN driver and flyback diode required.\n"
                     "No WebXR server, older fallback firmware, credentials, keys or compiled firmware included.\n"
                     "https://github.com/Omkarreddy143/aham\n")
print(output)
