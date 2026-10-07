# Start AHAM now

The headset is still pending and one teammate has Unity. Start with the desktop loop while hardware arrives. The repository provides an importable Unity asset folder, not a preconfigured headset-specific Unity project.

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

The starter's hand root is a desktop preset. Once the headset model is known, add its XR Origin/tracked pose setup, assign the tracked hand transform to `AhamHandRig.trackedRoot`, set `requireTrackedRoot=true`, and connect actual tracking validity through `SetTrackingValidity`. Until that adapter is implemented, do not call the root VR-tracked.

## 3. Prepare tools for the embedded teammate

Use Python 3.12 for the isolated tool environment:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m platformio run --project-dir firmware
```

If your default Python is newer and a dependency is incompatible, create the environment with your Python 3.12 executable instead. `intelhex` is included because the pinned ESP32 image-generation tool needs it.

The PlatformIO target is **classic `esp32dev`**, with the Espressif platform pinned to 6.12.0 (Arduino core 2.0.17). This target uses that core's channel-based LEDC API. Do not copy these PWM calls into an unpinned Arduino core 3 project: the API differs. [PlatformIO target](https://docs.platformio.org/en/stable/boards/espressif32/esp32dev.html), [pinned platform manifest](https://raw.githubusercontent.com/platformio/platform-espressif32/v6.12.0/platform.json), [current Espressif LEDC API](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/ledc.html)

Confirm the board and wiring against [hardware bring-up](hardware-bringup.md) before uploading. The software has not yet been tested on your received device.

## 4. Switch from simulated readings to USB

After bench verification, stop the simulator, close any serial monitor and use the verified device port:

```powershell
.\.venv\Scripts\python.exe host/run.py bridge --port COM5
```

`COM5` is an example, not a detected board. Unity now receives the real telemetry through the same local UDP path. All real arming remains explicit; the normally closed stop circuit must be healthy. Keep servo power disconnected: pressure/resistance drivers are not implemented.

On real sensors, hold a comfortable open hand still, capture open, then hold a comfortable closed hand still and capture closed. Ensure each raw channel changes and belongs to the correct finger before enabling motor power. Calibration cannot turn a disconnected or misplaced sensor into a valid measurement.

## 5. Verify changes

```powershell
python -m unittest discover -s tests -p test_host.py -v
powershell -ExecutionPolicy Bypass -File tools/check.ps1
```

The first command exercises Python framing, simulator faults, HTTP validation and the UDP command/telemetry loop. The script also compiles/tests the actual firmware's portable C++ protocol/supervisor and Unity's standalone C# codec if the corresponding local compilers are present. It does not pretend to test Unity physics/rendering without the editor.

Regenerate the import ZIP with `python tools/package_unity.py`. Regenerate shared wire fixtures only after a deliberate protocol change with `python tools/make_fixtures.py`; review the resulting bytes rather than silently accepting a changed contract.

## Immediate team assignments

| Teammate | Start now | Bring back to integration |
|---|---|---|
| A — embedded | Review board configuration and firmware; compile it | Actual board model, sensor readings and driver wiring |
| B — Unity | Import AHAM and run Unity-controlled simulation | Console/scene errors, five-finger mapping and contact results |
| C — mechanics | Prepare sensor placement, motor mounting and pressure fixture layout | Fit, strain relief and mechanical release design |
| D — integration | Run simulator fault cases and maintain verification record | Repeatable script, measured timings and hardware inventory |
