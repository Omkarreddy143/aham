# Start AHAM now

The received board is **ESP-12E NodeMCU V3 (ESP8266)**. It has only one ADC input; resistors and motor drivers are still missing. Start with the desktop loop and the USB/I2C probe in [received-hardware bring-up](hardware-bringup.md). Meta Quest 3 arrives later. The repository provides an importable Unity asset folder, not a preconfigured headset project.

Download the [complete starter ZIP](../artifacts/AHAM-Starter.zip) and extract it into a working folder. The [Unity import ZIP](../artifacts/AHAM-Unity-Starter.zip) contains only the assets to copy into an existing Unity project; run the host from the complete starter or repository.

## 1. Review the simulator immediately

From the repository root, with Python 3.10 or newer:

```powershell
python host/run.py simulate
```

Open **http://127.0.0.1:8870**. This mode requires no third-party Python packages and produces no real physical feedback.

1. Click **Open hand**, then **Capture open**.
2. Click **Close hand**, then **Capture closed**.
3. Click **Arm simulation**.
4. Select fingertip contact checkboxes and change the material cue.
5. Watch the output bars. Release contact before the two-second limit to start another cue.
6. Pause the command link: output stops and a timeout fault latches. Restore the link, clear fault and arm again.
7. Open the stop loop: output stops. Restore it, clear fault and arm again.

The finger illustration approximates curl. It is not optical hand tracking or proof of a physical touch sensation.

## 2. Give the Unity teammate the starter

Copy **`unity/Assets/AHAM`** and **`unity/Assets/AHAM.meta`** into the existing Unity project's `Assets` directory. Alternatively, extract `artifacts/AHAM-Unity-Starter.zip` into that directory. Use a desktop 3D project; no XR package is required for this starter.

For example, if your teammate's project is `C:\Projects\AhamDemo`, the finished layout must contain **`C:\Projects\AhamDemo\Assets\AHAM\Scripts\AhamDemo.cs`**. Copy the AHAM folder, not the whole repository into Assets. Unity should show an **AHAM** menu after it finishes compiling. This ZIP is a folder of scripts/assets to import; it is not opened as a complete project through Unity Hub.

Intended compatibility: Unity 2022.3/Unity 6 desktop on Windows. Runtime scripts still need to be compiled and played in the teammate's actual editor; this workstation does not have a confirmed Unity Editor installation.

1. On the Unity teammate's computer, use the full repository/starter ZIP and start the host in Unity-controlled simulation mode (both applications must run on the same computer for these localhost defaults):

   ```powershell
   python host/run.py simulate --controller unity
   ```

2. In Unity choose **AHAM -> Create Desktop Starter Scene**.
3. Press **Play**. A primitive hand and three colored contact blocks are constructed at runtime.
4. The status should identify **SIMULATED GLOVE**.
5. Enable outgoing commands in Unity; this first sends disarm and establishes a command sequence.
6. Use the browser simulator to open the hand; click **Capture open** in Unity. Close the simulated hand; click **Capture closed** in Unity.
7. Click **Arm** in Unity. Adjust curl and the desktop hand-depth slider to touch the colored blocks.
8. Unity's fingertip contacts generate haptic requests; browser bars show the simulated response.

When Unity is the controller, browser arm/calibration buttons and manual contact checkboxes are disabled. Browser curl, stop and link controls remain available. Surface selection in Unity comes from actual scene overlaps, not the browser material selector.

The starter's hand root is a desktop preset. Meta Quest 3 integration comes after the desktop loop works: add the teammate's verified XR Origin/tracked pose setup, assign the tracked hand transform to `AhamHandRig.trackedRoot`, set `requireTrackedRoot=true`, and connect actual tracking validity through `SetTrackingValidity`. Until that adapter is implemented, do not call the root VR-tracked. MPU6050 identification alone does not provide a tracked hand position.

## 3. Prepare NodeMCU tools for the embedded teammate

Use Python 3.12 for the isolated tool environment:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m platformio run --project-dir firmware -e nodemcu_probe
```

If your default Python is newer and a dependency is incompatible, create the environment with your Python 3.12 executable instead. `intelhex` is included because the pinned ESP32 image-generation tool needs it.

Use **`nodemcu_probe`** first: a text diagnostic at 115200 baud, with actuator supplies disconnected. Upload and wiring steps are in [hardware bring-up](hardware-bringup.md). It is separate from the binary glove firmware and does not work with the USB bridge.

After obtaining divider resistors and verifying A0 voltage, build the one-index-finger binary firmware:

```powershell
.\.venv\Scripts\python.exe -m platformio run --project-dir firmware -e nodemcuv2
.\.venv\Scripts\python.exe -m platformio run --project-dir firmware -e nodemcuv2 --target upload --upload-port COM5
```

Replace COM5 with your actual board port. The default target is NodeMCU, platform `espressif8266@4.2.1` / Arduino core 3.1.2. Motor output defaults disabled because the kit has no driver. Index is channel 1 (mask 2); other physical channels remain zero. [Board target](https://docs.platformio.org/en/stable/boards/espressif8266/nodemcuv2.html), [pinned platform manifest](https://raw.githubusercontent.com/platformio/platform-espressif8266/v4.2.1/platform.json)

The alternate `esp32dev` environment remains for a classic ESP32 replacement, pinned to Espressif 6.12.0 / Arduino 2.0.17. Its GPIO/ADC/LEDC APIs differ from NodeMCU. Select the environment explicitly for the board you actually have.

Check wiring before uploading. The software has not yet been tested on the received device. Keep coin motor/servo supplies disconnected during sensor bring-up.

## 4. Switch from simulated readings to USB

After uploading the **binary `nodemcuv2` firmware** and verifying the divider, stop the simulator, close the text monitor and use the verified device port:

```powershell
.\.venv\Scripts\python.exe host/run.py bridge --port COM5
```

`COM5` is an example, not a detected board. Unity now receives the real telemetry through the same local UDP path. All real arming remains explicit; the normally closed stop circuit must be healthy. Keep servo power disconnected: pressure/resistance drivers are not implemented.

On NodeMCU, hold a comfortable open index finger still and capture open, then comfortably bend it and capture closed. Only the index raw/curl slot should change; four other slots stay zero. Unity displays active flex/motor masks: initially 2 / 0. A healthy stop loop is required for explicit arming, even though outputs remain disabled. After obtaining and validating the driver, follow the motor-enable instructions in hardware bring-up; the masks then become 2 / 2. Calibration cannot validate a disconnected/misplaced sensor or motor driver.

## 5. Verify changes

```powershell
python -m unittest discover -s tests -p test_host.py -v
powershell -ExecutionPolicy Bypass -File tools/check.ps1
```

The first command exercises Python framing, simulator faults, HTTP validation and the UDP command/telemetry loop. The script also compiles/tests the actual firmware's portable C++ protocol/supervisor and Unity's standalone C# codec if the corresponding local compilers are present. It does not pretend to test Unity physics/rendering without the editor.

Regenerate the import ZIP with `python tools/package_unity.py` and the complete source ZIP with `python tools/package_starter.py`. The complete ZIP excludes packaged artifacts to avoid nesting previous ZIPs. Stage new source files before packaging so they are included. Regenerate shared wire fixtures only after a deliberate protocol change with `python tools/make_fixtures.py`; review the resulting bytes rather than silently accepting a changed contract.

## Immediate team assignments

| Teammate | Start now | Bring back to integration |
|---|---|---|
| A — embedded | Build NodeMCU probe; verify USB, then MPU/PCA I2C with servo V+ disconnected | Addresses, A0 range and divider plan |
| B — Unity | Import AHAM and run Unity-controlled simulation | Console/scene errors, five-finger mapping and contact results |
| C — mechanics | Lay out five flex sensors and index motor on the glove; keep servos off-hand | Fit and strain relief without actuating anything |
| D — integration | Request resistors/driver/stop parts and ESP32 or extra ADCs; test simulator faults | Actual inventory, power measurements and repeatable demo script |
