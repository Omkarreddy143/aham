"""Package the five-finger bench project; exclude private keys and verified local settings."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
output = root / "artifacts/AHAM-Five-Finger-Hardware.zip"
paths = ["firmware/src/wifi_glove.cpp", "firmware/include/BoardConfig.h",
         "firmware/include/AhamProtocol.h", "firmware/include/BenchController.h",
         "firmware/include/BenchAuth.h", "firmware/include/BenchConfig.example.h",
         "firmware/include/GloveController.h", "firmware/include/GloveOutputs.h", "firmware/include/BenchServoSweep.h",
         "firmware/include/GloveConfig.example.h", "firmware/include/WifiSecrets.example.h",
         "host/run.py", "host/aham/__init__.py", "host/aham/protocol.py",
         "host/aham/wifi_monitor.py", "host/aham/wifi_bench.py", "host/aham/wifi_glove.py", "host/aham/glove_test.py",
         "host/aham/serial_glove.py", "host/requirements.txt", "tests/test_serial_glove.py", "tests/test_usb_recovery.py",
         "host/aham/auto_feedback.py", "tests/test_auto_feedback.py", "docs/automatic-feedback.md", "Automatic VR Feedback.cmd",
         "tools/glove_command.py", "tools/servo_sweep.py", "Enable Index Feedback.cmd", "Stop Glove.cmd", "docs/usb-glove-quickstart.md",
         "tools/setup_wifi_bench.py", "tests/test_wifi_glove.py", "tests/test_wifi_monitor.py",
         "tests/wifi_glove_tests.cpp", "tests/fixtures/wifi-glove.txt",
         "docs/five-finger-hardware.md", "docs/hardware-test-without-vr.md", "tests/test_glove_test.py"]
output.parent.mkdir(exist_ok=True)
with ZipFile(output, "w", ZIP_DEFLATED) as archive:
    for name in paths:
        archive.write(root / name, name)
    archive.writestr("firmware/platformio.ini", """[platformio]
default_envs = nodemcu_wifi_glove

[env:nodemcu_wifi_glove]
platform = espressif8266@4.2.1
board = nodemcuv2
framework = arduino
build_flags = -Wall -Wextra
build_src_filter = +<wifi_glove.cpp>
monitor_speed = 115200
""")
    archive.writestr(".gitignore", "**/WifiSecrets.h\n**/BenchSecrets.h\n**/BenchConfig.h\n**/GloveConfig.h\n*.key\nlocal-data/\n**/.pio/\n.venv/\n__pycache__/\n*.pyc\n")
    archive.writestr("START-HERE.txt", "AHAM five-finger hardware bench project\n\n"
                     "Read docs/five-finger-hardware.md for the full circuit and procedure.\n"
                     "Without VR: read docs/hardware-test-without-vr.md; glove-test starts with zeros.\n"
                     "Existing VR website/server stays unchanged; this ZIP contains no scene/server.\n"
                     "Open firmware in VS Code/PlatformIO; default environment nodemcu_wifi_glove.\n"
                     "From this root run python tools/setup_wifi_bench.py --five-finger.\n"
                     "Edit only the local WifiSecrets.h and GloveConfig.h copies.\n"
                     "Outputs ship DISABLED; test each completed circuit before enabling its bit.\n"
                     "Order: thumb,index,middle,ring,little. Servo channels 0..4; motor SIGNAL channels 8..12.\n"
                     "Each motor needs its own NPN transistor, base/pull-down resistors and diode.\n"
                     "PCA VCC from NodeMCU 3V; separate 5 V servo V+ and suitable separate 3 V motor supply.\n"
                     "Motor power NEVER comes from PCA channel + pins. Supplies remain to be confirmed.\n"
                     "Tendons DETACHED for initial tests. Provide independent mechanical release.\n"
                     "Run python host/run.py wifi-glove --esp-ip YOUR_ESP_IP --key-file local-data/wifi-bench.key\n"
                     "UDP 4212; Serial 115200. No credentials, keys, enabled settings or binaries included.\n"
                     "https://github.com/Omkarreddy143/aham\n")
print(output)
