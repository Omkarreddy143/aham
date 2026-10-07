# AHAM

**A bidirectional haptic interface for a virtual hand.**

AHAM maps physical finger movement to a Unity virtual hand and returns synchronized contact cues through fingertip actuators. The project also explores participants' reported ownership of the virtual hand.

## Current status

The first software milestone is implemented: a hardware-free glove simulator, ESP32 vibration firmware, a local USB bridge and importable Unity desktop starter assets. The actual headset integration and hardware validation are pending.

| Component | Status |
|---|---|
| Browser glove simulator | Runs without hardware; calibration, material cues, output bars and fault controls |
| ESP32 firmware | Compiles for classic ESP32 DevKit; five flex inputs, five motor PWM channels and local supervision |
| Shared binary protocol | Python/C++/C# interoperability checked with common fixtures |
| Unity starter | Primitive hand, three contact surfaces and operator controls; editor compile/play check still required |
| USB bridge | Implemented; requires a verified serial device and bench test |
| VR root tracking | Adapter pending headset/controller model |
| Pressure, tendon resistance, GSR and participant logger | Not implemented in this starter |

## Start now

Download the [complete starter ZIP](artifacts/AHAM-Starter.zip) or the [Unity import ZIP](artifacts/AHAM-Unity-Starter.zip), then follow the [quickstart](docs/quickstart.md).

```powershell
python host/run.py simulate
```

Open **http://127.0.0.1:8870**. This is simulation only and cannot drive hardware. See the [quickstart and team assignments](docs/quickstart.md) to calibrate the simulator, import the Unity assets and connect the desktop loop.

For Unity-controlled simulation, use `python host/run.py simulate --controller unity`, copy `unity/Assets/AHAM` and its `.meta` file into the teammate's project, then choose **AHAM -> Create Desktop Starter Scene**.

## Development references

- [Wire protocol v1](docs/protocol.md)
- [Provisional hardware wiring and bring-up](docs/hardware-bringup.md)
- [Verification record](docs/verification.md)
- [Full architecture and 40-hour schedule](AHAM-40-hour-plan.md)

Folders: `firmware/` embedded application, `host/` simulator/USB bridge, `unity/` importable assets, `tests/` protocol and supervisor checks, and `tools/` packaging/verification helpers.

## Planned prototype

- One glove with five flex-sensor finger-curl channels.
- VR controller/tracker input for hand-root position and orientation.
- Five independently controlled fingertip vibration motors.
- One index-fingertip pressure channel, subject to mechanism and release validation.
- A Unity scene with material-associated cues and an exploratory body-ownership demonstration.

Tendon resistance and GSR logging are stretch features. Vibration, local pressure and movement resistance are distinct feedback channels; the demonstration will identify the channels actually delivered.

## Architecture and schedule

Read the [full architecture and 40-hour build plan](AHAM-40-hour-plan.md) for hardware, software modules, communication, team assignments, validation and fallback decisions.

The plan assumes a four-person team and includes the approximately three-hour wait for components within the total forty-hour budget.

## First implementation milestone

By hour 13, demonstrate the complete loop:

**Real finger movement → virtual hand → virtual contact → matching fingertip vibration.**

Local actuator limits, command expiry and a direct mechanical release are required before adding worn mechanical feedback.
