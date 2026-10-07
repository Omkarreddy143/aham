# AHAM

**Start now:** open the `unity` project and press Play. The new default software preview animates the index finger and wrist without hardware. [Before-resistors guide: preview, optional MPU6050 and four-person tasks](docs/before-resistors.md).


**A bidirectional haptic interface for a virtual hand.**

AHAM maps physical finger movement to a Unity virtual hand and returns synchronized contact cues through fingertip actuators. The project also explores participants' reported ownership of the virtual hand.

## Current status

**Current build scope: one physical index finger, one flex sensor and one vibration motor.** Complete the [index-finger milestone](docs/index-finger-mvp.md) before expanding to five fingers. No external ADC is needed for this first version.

**Start with [the basic step-by-step index guide](docs/index-finger-step-by-step.md).** [Arduino IDE board code](artifacts/AHAM-Index-Arduino.zip) includes a readable flex-sensor check and the complete Unity-compatible NodeMCU sketch. USB powers the board/sensor; motor power is a separate verified stage.

**Using VS Code / PlatformIO after upload?** Use [the short real-board connection procedure](docs/platformio-after-upload.md).

The kit has arrived: **ESP-12E NodeMCU V3 (ESP8266)**, five flex sensors, MPU6050, PCA9685, five servos, Grove GSR, one coin motor reported as **10 mm / 3 V** and a 5 V / 2 A adapter. A 2N2222A is available; its pinout, the received resistor values and motor current remain unverified. A regulated 3 V motor supply, flyback diode and extra analog inputs have not been confirmed available. Meta Quest 3 is assigned later. Start with the desktop simulator and NodeMCU USB/I2C probe; move to one index flex sensor after verifying divider resistors. See [actual hardware and required parts](docs/hardware-bringup.md).

| Component | Status |
|---|---|
| Browser glove simulator | Runs without hardware; calibration, material cues, output bars and fault controls |
| NodeMCU firmware | One index ADC channel; missing channels stay zero; motor output disabled until driver verification |
| NodeMCU probe | Separate text diagnostic for USB, I2C ACKs and MPU identity; commands no servo motion |
| ESP32 alternative | Retained five-channel build for a classic ESP32 replacement; motor outputs default disabled |
| Shared binary protocol | Python/C++/C# interoperability checked with common fixtures |
| Unity desktop project | Open `unity/` in Unity Hub; automatic/manual index and wrist preview, optional MPU6050 slow tilt, contact surfaces and operator controls |
| USB bridge | Implemented; requires a verified serial device and bench test |
| VR root tracking | Meta Quest 3 adapter pending; desktop setup works without XR |
| Pressure, tendon resistance, GSR and participant logger | Not implemented in this starter |

## Start now

Download the [complete starter ZIP](artifacts/AHAM-Starter.zip) or the [Unity import ZIP](artifacts/AHAM-Unity-Starter.zip), then follow the [quickstart](docs/quickstart.md).

```powershell
python host/run.py simulate
```

Open **http://127.0.0.1:8870**. This is simulation only and cannot drive hardware. See the [quickstart and team assignments](docs/quickstart.md) to calibrate the simulator, import the Unity assets and connect the desktop loop.

For the new desktop project, add the repository's **`unity` folder** to Unity Hub and open it. Run `python host/run.py simulate --controller unity` from the repository root, then choose **AHAM -> Create Desktop Starter Scene** and press Play. Turn **Software preview** off to use the simulator or real USB input. [Step-by-step Unity instructions](unity/README.md)

For a teammate's existing project, copy `unity/Assets/AHAM` and its `.meta` file into their Assets folder or extract the Unity import ZIP there.

## Development references

- [Index-finger hardware milestone and driver parts](docs/index-finger-mvp.md)
- [Wire protocol v1](docs/protocol.md)
- [Received hardware, missing parts and bring-up](docs/hardware-bringup.md)
- [Verification record](docs/verification.md)
- [Full architecture and 40-hour schedule](AHAM-40-hour-plan.md)

Folders: `firmware/` embedded application, `host/` simulator/USB bridge, `unity/` importable assets, `tests/` protocol and supervisor checks, and `tools/` packaging/verification helpers.

## Planned prototype

- One index flex sensor animating the virtual index finger.
- One coin motor providing index contact cues through a verified driver.
- A Unity desktop scene with three material-associated cue patterns.
- Calibration, physical stop, command expiry and repeatable reconnect behavior.

Later: expand to five fingers, add Quest 3 root tracking, and investigate pressure/resistance after separate mechanism validation.

Tendon resistance and GSR logging are stretch features. Vibration, local pressure and movement resistance are distinct feedback channels; the demonstration will identify the channels actually delivered.

## Architecture and schedule

Read the [full architecture and 40-hour build plan](AHAM-40-hour-plan.md), including its received-kit revision, for hardware, modules, team assignments and fallback decisions.

The plan assumes a four-person team and includes the approximately three-hour wait for components within the total forty-hour budget.

## First implementation milestone

Target the complete loop by hour 13 **if the required divider and motor-driver parts arrive**; use one index finger first:

**Real finger movement → virtual hand → virtual contact → matching fingertip vibration.**

Local actuator limits, command expiry and a direct mechanical release are required before adding worn mechanical feedback.
