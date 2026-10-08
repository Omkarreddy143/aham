# AHAM — hand to world

**Selected build: a WebXR app in Meta Quest 3 Browser, with a feedback glove. Unity is no longer required for this path.**

The Quest estimates hand orientation and finger joints. **Orbit Foundry v4** adds a 75-second right-hand grab, lift and delivery game with a compact VR scoreboard, highlighted grab targets and matching docks. The browser calculates five vibration cues and five weight-dependent resistance requests. A laptop relay sends observation data over hotspot Wi-Fi; the team has confirmed actual ESP receipts. Physical motor and servo output remain disabled.

**Start with the [WebXR quickstart](docs/webxr-quickstart.md).** The browser scene and observation relay are implemented. Physical vibration and servo resistance require separate bring-up.

Windows shortcut: double-click **Open VR Link.cmd** to reuse or repair the HTTPS link; **Refresh VR Link.cmd** forces a new one. The verified URL is copied to the clipboard and saved in **VR-LINK.txt**. The shortcuts update the relay origin together with the tunnel and preserve ESP settings.

```text
Quest hand tracking → WebXR hand → virtual contact → cue
  → HTTPS → laptop relay → hotspot Wi-Fi → NodeMCU receive-only monitor

Later verified output path:
  actuator-only NodeMCU firmware → driver / servo controller → glove
```

## What works now

| Part | Status |
|---|---|
| WebXR scene | Team confirmed both-hand tracking and live cue receipt; 25 joints per hand and five independent curls/contact cues |
| Orbit Foundry game | Right-hand grasp/pinch, lift/release, matching-dock scoring and combos; v4 improves attachment, gesture stability, contact geometry and VR guidance; updated headset trial next |
| Desktop preview | Synthetic grab/lift/delivery rehearsal; submits no cues and can monitor Quest |
| Feedback monitor | Calculated cue, HTTP acceptance, matching bridge echo and board telemetry shown separately |
| Wireless access | Temporary Cloudflare HTTPS tunnel supported; see quickstart |
| Wi-Fi to NodeMCU | Team confirmed ESP receipts with changing vibration/resistance requests and HOLD state; OUTPUT remains OFF |
| Real flex sensing | Previously demonstrated in Unity; retained as a fallback |
| Vibration motor | Driver and diode bring-up incomplete; no physical vibration verified |
| Servo resistance | Five requests, locally armed five-channel bench firmware and sender implemented; physical control pending supply, measured mechanics and release |

The WebXR relay sends only to the observation port. It never sends to the actuator command port or serial device. Separate local **index** and **five-finger hardware companions** send authenticated actuator packets, with explicit local arming and default-disabled hardware flags. The five-finger version uses one PCA9685: servos 0–4, motor-driver signals 8–12. The website is unchanged. Physical movement remains unverified. Do not treat a displayed cue or commanded pulse as a physical sensation.

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
- [One-index hardware ZIP](artifacts/AHAM-Index-Hardware.zip) and [servo/motor wiring and bench quickstart](docs/index-hardware-quickstart.md)
- [Five-finger hardware ZIP](artifacts/AHAM-Five-Finger-Hardware.zip) and [full circuit, PlatformIO code and setup](docs/five-finger-hardware.md)
- [Game and servo-resistance contract](docs/servo-resistance-plan.md)
- [Verification record](docs/verification.md)
- [Judging preparation for the 25/25/50 rubric](docs/judging-preparation.md), [speaking script](docs/judging-talk.md), [Tattva explanation and shlokas](docs/tattva-explanation.md) and [blank observation sheet](docs/judging-observations.csv)
- [Judging pack ZIP](artifacts/AHAM-Judging-Pack.zip) and [offline BODY / MIND / AWARENESS spectator cards](docs/judging-cards.html)
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
