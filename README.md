# AHAM — hand to world

**Selected build: a WebXR app in Meta Quest 3 Browser, with a feedback glove. Unity is no longer required for this path.**

The Quest estimates hand orientation and finger joints. **Orbit Foundry v3** adds a 75-second right-hand grab, lift and delivery game: three energy cores, matching docks, score and combo bonuses. The browser calculates five vibration cues and five weight-dependent resistance requests. A laptop relay monitors both; physical servo output is disabled. The NodeMCU can remain connected to the laptop by USB while the Quest connects wirelessly.

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
| WebXR scene | Team confirmed both-hand tracking and live cue receipt; 25 joints per hand and five independent curls/contact cues |
| Orbit Foundry game | Right-hand grasp/pinch, palm-relative carry, lift, release, matching-dock scoring, combos and an in-world restart; headset gameplay trial next |
| Desktop preview | Synthetic grab/lift/delivery rehearsal; submits no cues and can monitor Quest |
| Feedback monitor | Calculated cue, HTTP acceptance, matching bridge echo and board telemetry shown separately |
| Wireless access | Temporary Cloudflare HTTPS tunnel supported; see quickstart |
| Wi-Fi to NodeMCU | Receive-only UDP companion + PlatformIO receiver compiled; actual hotspot upload/receipt trial next |
| Real flex sensing | Previously demonstrated in Unity; retained as a fallback |
| Vibration motor | Driver and diode bring-up incomplete; no physical vibration verified |
| Servo resistance | Five software requests and expiring laptop receipt implemented; physical control pending supply, measured mechanics, release and firmware |

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
- [Wi-Fi receiver ZIP](artifacts/AHAM-WiFi-Monitor.zip) and [2.4 GHz hotspot setup](docs/wifi-quickstart.md)
- [Game and servo-resistance contract](docs/servo-resistance-plan.md)
- [Verification record](docs/verification.md)
- [Original 40-hour plan](AHAM-40-hour-plan.md), with the selected WebXR revision at the top
- [Wire protocol](docs/protocol.md)
- [Motor hardware guide](docs/index-finger-mvp.md)

The earlier [Unity project](unity/README.md), [Unity ZIP](artifacts/AHAM-Unity-Starter.zip) and [sensor-based NodeMCU sketch](artifacts/AHAM-Index-Arduino.zip) are retained for fallback/reference. Their flex-calibration arming logic is not an actuator-only implementation.

## Verification

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py"
node --test tests/webxr-logic.test.mjs tests/webxr-game.test.mjs
```

The browser library is pinned and vendored; no npm install or CDN is needed to run this prototype. A Quest session is required to validate actual hand tracking, fitted-glove visibility, contact placement and network delay. Optical pose estimation does not measure tendon force.

For wireless glove **data receipt**, use `nodemcu_wifi_monitor` and the Wi-Fi guide. It prints five vibration and resistance requests at 115200 baud and acknowledges LAN packets. It does not control servos or vibration motors; keep this distinct from the older `nodemcuv2` sensor firmware and its binary USB telemetry.
