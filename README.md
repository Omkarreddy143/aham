# AHAM — hand to world

**Selected build: a WebXR app in Meta Quest 3 Browser, with a feedback glove. Unity is no longer required for this path.**

The Quest estimates hand orientation and finger joints. The browser renders the virtual hand, detects index-fingertip contact, and calculates a vibration cue. A laptop relay receives that cue. The NodeMCU can remain connected to the laptop by USB while the Quest connects wirelessly.

**Start with the [WebXR quickstart](docs/webxr-quickstart.md).** The browser scene and observation relay are implemented. Physical vibration and servo resistance require separate bring-up.

```text
Quest hand tracking → WebXR hand → virtual contact → cue
  → HTTPS → laptop relay → cue monitor

Later verified output path:
  laptop → USB → actuator-only NodeMCU firmware → driver / servo controller
```

## What works now

| Part | Status |
|---|---|
| WebXR scene | Three contact surfaces; joint rig, index curl and wrist orientation; headset testing required |
| Desktop preview | Synthetic hand to check the scene; transmits zero output |
| Feedback monitor | Calculated cue, HTTP acceptance, matching bridge echo and board telemetry shown separately |
| Wireless access | Temporary Cloudflare HTTPS tunnel supported; see quickstart |
| Real flex sensing | Previously demonstrated in Unity; retained as a fallback |
| Vibration motor | Driver and diode bring-up incomplete; no physical vibration verified |
| Servo resistance | Not implemented; needs a suitable supply, bounded mechanics and release testing |

The WebXR relay sends only to the observation port. It never sends to the actuator command port or serial device. The shipped board configuration has no enabled motor channel. Do not treat a displayed cue as a physical sensation.

## Run locally

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r host/requirements.txt
.\.venv\Scripts\python.exe host/run.py webxr
```

Open **http://localhost:8890/** on the laptop. For the headset, follow the quickstart's HTTPS route; a plain LAN HTTP URL does not satisfy WebXR's secure-context requirement.

Optional companion bridge, after stopping any other COM7 owner:

```powershell
.\.venv\Scripts\python.exe host/run.py bridge --port COM7 --stats --cue-monitor --telemetry-port 8877
```

The received board is **ESP-12E NodeMCU V3 / ESP8266**, rather than ESP32. Quest tracking removes the need for flex sensors and MPU6050 in the selected mode. It does not remove the motor driver, flyback diode, servo controller or appropriate actuator supplies. Keep the working flex fallback until the actual glove passes an optical-tracking test.

## Downloads and guides

- [WebXR starter ZIP](artifacts/AHAM-WebXR-Starter.zip)
- [Complete repository starter ZIP](artifacts/AHAM-Starter.zip)
- [WebXR architecture and next checkpoints](docs/webxr-architecture.md)
- [WebXR quickstart](docs/webxr-quickstart.md)
- [Verification record](docs/verification.md)
- [Original 40-hour plan](AHAM-40-hour-plan.md), with the selected WebXR revision at the top
- [Wire protocol](docs/protocol.md)
- [Motor hardware guide](docs/index-finger-mvp.md)

The earlier [Unity project](unity/README.md), [Unity ZIP](artifacts/AHAM-Unity-Starter.zip) and [sensor-based NodeMCU sketch](artifacts/AHAM-Index-Arduino.zip) are retained for fallback/reference. Their flex-calibration arming logic is not an actuator-only implementation.

## Verification

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py"
node --test tests/webxr-logic.test.mjs
```

The browser library is pinned and vendored; no npm install or CDN is needed to run this prototype. A Quest session is required to validate actual hand tracking, fitted-glove visibility, contact placement and network delay. Optical pose estimation does not measure tendon force.
