# Selected AHAM architecture — Quest Browser

The selected revision replaces Unity, flex sensors and MPU6050 as primary tracking with Quest 3 optical hand tracking in WebXR. The software now tracks both hands and all five fingers; the selected feedback hand maps to five channels. Start physical actuator bring-up with the one available index motor.

## Modules

| Module | Responsibility | Current implementation |
|---|---|---|
| Quest tracking | Estimated wrist orientation and 25 hand-joint poses | Team confirmed both-hand tracking and cue receipt on Quest |
| Hand view | Render joint positions and connecting bones | Independent left/right Three.js rigs; 25 joints each |
| Curl estimate | Display bending from adjacent bone angles | Approximate visual curl; no flex calibration required |
| Orbit Foundry | Grasp/pinch, gesture-anchor carry, lift, drop, match and score | Pure game state, 75-second shift, three core masses, combos, in-world restart |
| Contact cues | Tip-to-core boxes or inferred grasp contact | Ion 95/1; Flux 130/2; Nova 155/3; five channels for the selected feedback hand |
| Resistance preview | Five normalized right-finger requests and captured curl | Separate strict `/api/grip-preview`; expires after 500 ms; no board output |
| HTTPS link | Carry wireless headset requests | Temporary Cloudflare tunnel to a loopback HTTP server |
| Laptop relay | Validate requests and distinguish acceptance from receipt | Strict JSON, monitor UDP 8767, matching echoes on 8877 |
| Existing USB bridge | Observe board telemetry and echo monitor packets | COM7/230400 baud; monitor packets have no serial output route |
| Wi-Fi data companion | Laptop loopback preview -> private LAN UDP -> ESP receipt | Optional `wifi-monitor`; separate type 5/6 observation packets; no actuator output |
| Actuator-only firmware | Accept external cues without local flex calibration | Pending; current firmware needs a new mode |
| Vibration driver | Switch motor current and suppress inductive kick | Pending verified supply, circuit, diode and transistor pinout |
| Servo mechanism | Produce bounded tendon resistance | Pending; PCA9685/servos do not measure force or ensure release |

Returned joints are estimated poses; obscured joints may be emulated. Pose availability is not a confidence measurement. [Meta WebXR Hands](https://developers.meta.com/vr/documentation/web/webxr-hands/), [WebXR hand-input specification](https://immersive-web.github.io/webxr-hand-input/#xrjointspace)

```mermaid
flowchart LR
    H[Quest estimated hand joints] --> V[WebXR hand and scene]
    V --> C[Five fingertip contact cues]
    C --> S[HTTPS to laptop relay]
    S --> M[Observation monitor]
    M --> D[Matching receipt on browser panel]
    B[NodeMCU board telemetry] --> D
    S -. future verified route .-> A[Actuator-only firmware]
    A -.-> N[Vibration driver]
    A -.-> P[PCA9685 and bounded servo mechanism]
```

## Timing and loss handling

The browser renders at the headset's supplied frame rate, submits cues at most about 20 times per second, and polls the monitor about five times per second. These are initial prototype rates, not measured latency. HTTP polling avoids new server dependencies. The tunnel adds an internet round trip; this route is suitable for the monitor checkpoint, not established as a responsive servo-control path.

Missing joints clear the affected finger's cue; missing wrist clears all five channels. A hidden XR session, stopped frames or session end clears both hand poses and all cues. Desktop preview sends zeros. Receipt ages out after 500 ms; board telemetry after 200 ms. HTTP acceptance never creates a receipt. Echoes must match a recently submitted packet, preventing another application from masquerading as WebXR receipt.

Desktop rehearsal is read-only: it submits no cues or resistance requests and can monitor live Quest values. Any synthetic request received by the relay is still forced to zero. The right-hand game requires all five valid, nondegenerate finger chains and a valid wrist orientation. Loss suspends the timer, releases the core with zero throw speed, clears resistance and requires opening before a new grasp. Round end clears requests too. Pickup preserves object-to-palm translation and rotation; visual hands are never clamped to a grip pose.

Before physical output, implement a local firmware watchdog independent of browser/network behavior, explicit arming, validated channel limits and an independent stop. Current v1 pressure/mode fields remain zero; pressure is unsupported. The preview percentages must not be converted directly into servo angles. The [game and servo-resistance contract](servo-resistance-plan.md) records the implemented schema and pending measured mechanism limits. Stopping servo PWM alone does not guarantee tendon release.

## Team checkpoints within the remaining event time

This revision does not restart the forty-hour event clock. Use the actual remaining time and these pass/fail gates. Estimates begin at the pivot; shorten scope if a gate misses its deadline.

| Time from pivot | Gate | Parallel team work |
|---|---|---|
| 0–1 hour | Wireless page opens; bare-hand tracking works | Headset setup; scene/relay checks; motor parts; glove placement |
| 1–2 hours | Index touches three targets; cues and echoes agree | Curl/contact capture; relay receipt logging; glove visibility trial |
| 2–4 hours | One motor gives repeatable cues on the bench | Actuator-only firmware; verified driver; timeout/stop tests |
| 4–6 hours | Worn index vibration remains reliable | Cable routing; glove tracking; measured onset; repeatable demo |
| Remaining time | Optional one-servo bench prototype, then rehearsal | Only attempt after mechanism, supply and release checks; five fingers are a stretch |

Stop servo expansion before the final two event hours. Rehearse the achieved demonstration and state its delivered feedback channel accurately. If glove tracking fails, retain the flex fallback. If motor parts remain unavailable, present live Quest tracking with calculated/received cues and identify physical actuation as incomplete.

## Hardware retained

Retain NodeMCU, glove, coin motors, drivers/diodes and power wiring. Retain PCA9685 and servos for later mechanism work. Flex sensors, divider wiring and MPU6050 become backup sensing. GSR remains outside the first demonstration.

The ESP8266 has Wi-Fi and no built-in BLE. The new [Wi-Fi receive-only checkpoint](wifi-quickstart.md) uses a 2.4 GHz hotspot: the laptop polls accepted cue/grip previews on loopback and sends type 5 observation packets to a configured private ESP IPv4 at UDP 4210. Matching type 6 receipts confirm the ESP validated the data. The firmware keeps outputs OFF, rejects wrong peer IP/invalid fields/duplicates and clears stored requests after a 250 ms lease. USB remains for first upload, power and logs; the old bridge must release COM7 before uploading or opening the new 115200-baud text monitor. Browser USB echo and ESP Wi-Fi receipt are separate indicators. Do not treat this CRC/IP-filtered observation link as an authenticated actuator-control protocol.

A later LAN Wi-Fi actuator route can reduce cables but still needs actuator firmware, local arming, measured release, reconnect and watchdog validation. Do not power servos from the board's 3.3 V output, or assume the 5 V/2 A adapter can supply five loaded servos.
