# AHAM: technical explanation for the first judging round

## Opening explanation

AHAM is a bidirectional interface between a person's real hand and a virtual hand. Quest hand tracking supplies movement to a browser-based virtual environment. Our application detects virtual contact, grasping and lifting, and calculates five vibration cues and five finger-resistance requests. A laptop relay delivers those requests to an ESP8266 over Wi-Fi. The prepared glove hardware uses vibration motors for contact cues and servo-driven tendons for finger resistance.

Our confirmed demonstration is hand tracking, virtual interaction and ESP receipt of changing feedback requests. Physical vibration, tendon resistance and force calibration are separate validation stages. The current local firmware configuration has motor and servo verification masks set to zero and servo pull offsets set to zero; receipt alone does not mean the hardware moved.

## 1. What runs on each device?

| Device | Actual role | Software |
|---|---|---|
| Meta Quest 3 | Tracks hands, runs the 3D scene, detects contact/grasp/lift and calculates feedback requests | Quest Browser, WebXR and our JavaScript/Three.js application |
| Laptop | Serves the website, runs the temporary HTTPS tunnel, validates incoming requests and forwards fresh data to the ESP | Python relay, `cloudflared`, Python five-finger Wi-Fi companion |
| NodeMCU V3 | Receives authenticated packets, reports receipt/output state and contains the motor/servo control logic | ESP8266 Arduino framework, C++ firmware built with PlatformIO |

The NodeMCU is an **ESP8266 / ESP-12E**, not an ESP32. Unity, flex sensors and MPU6050 are not required in this current WebXR tracking path. We used an index-flex/Unity prototype earlier, then moved tracking to the headset to reduce glove wiring.

The laptop is the website host and communication gateway. The headset downloads the application and renders the immersive scene locally. We are not streaming a laptop-rendered VR video into the headset.

## 2. How does the virtual hand follow the real hand?

Quest's built-in tracking system estimates hand poses. Our app uses the hand-joint poses exposed by WebXR; we did not build Meta's camera-tracking algorithm or read raw camera video for this implementation.

For each hand, the app can read 25 joint poses: the wrist and finger joints. Each available joint provides a 3D position and orientation. The current code reads them through `XRFrame.getJointPose()` and keeps the left and right hands separate. Missing poses remain unavailable instead of being replaced by simulated movement. [WebXR hand-input specification](https://immersive-web.github.io/webxr-hand-input/)

Our application then:

1. Draws the virtual hand from these joint positions.
2. Uses wrist orientation to orient the hand and held objects.
3. Estimates finger curl from the angles between adjacent finger-bone directions.
4. Detects pinch from thumb-tip to index-tip distance.
5. Detects grasp/release using finger curl, proximity and short dwell periods.

Curl is a normalized geometric estimate from 0 to 1, not a calibrated anatomical angle or a flex-sensor measurement. A pose being available is also not a guarantee that an obscured finger was measured accurately.

Both hands are displayed. The current game and five-channel glove feedback use the **right hand**.

## 3. How do we run VR without Unity?

We use **Three.js** to build and render the objects, hands, lights and scoreboard, and **WebXR** to access the headset's immersive display and tracked input.

The user opens our HTTPS website in Quest Browser and presses Enter VR. The app requests an `immersive-vr` session with the `hand-tracking` feature. The browser and headset handle the stereo views and head pose while our render loop updates the scene. [WebXR Device API](https://www.w3.org/TR/webxr/)

This route lets us update the browser application without building and installing a Unity Android APK. It does not remove the need to validate the glove or tracking with the actual headset.

## 4. How is the temporary Quest link generated?

Our Python server listens locally on `http://127.0.0.1:8890`. That address refers to the laptop's own loopback interface; entering localhost on the Quest would refer to the Quest itself.

On the laptop, we run:

```powershell
.\.build\cloudflared.exe tunnel --url http://127.0.0.1:8890 --protocol http2 --edge-ip-version 4 --no-autoupdate
```

The tunnel client establishes an outbound connection to Cloudflare, which provides a temporary public HTTPS address under `trycloudflare.com`. Requests arriving at that address are forwarded through the tunnel to our local server. The relay is configured with that exact HTTPS origin so browser feedback requests are accepted from the correct site.

HTTPS provides the secure browser context required for this wireless WebXR route. The tunnel avoids configuring inbound router port forwarding for the laptop. Quick Tunnels are a development service: their hostname changes when a new tunnel is created, and they have no uptime guarantee. An expired URL must be replaced on both the relay configuration and the Quest page. [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/), [WebXR specification](https://www.w3.org/TR/webxr/)

Cloudflare is forwarding web traffic; it is not calculating hand poses or controlling servo motion.

## 5. How are the three devices connected?

```text
Real hand
   |
   v
Quest tracking -> WebXR scene running ON QUEST
   |                |
   |                +-> virtual hand / contact / grasp / lift
   |                                  |
   +----------------------------------+-> five-channel requests
                                         |
                             HTTPS over Internet
                                         v
                              Cloudflare Quick Tunnel
                                         |
                               tunnel to laptop
                                         v
                              Python relay :8890
                                         |
                             local Wi-Fi companion
                                         |
                        authenticated UDP over hotspot
                                         v
                             ESP8266 / UDP :4212
                                         |
                               I2C -> PCA9685
                                         |
                        motor drivers / servo signals
                        [requires verified activation]

ESP -> authenticated receipt -> laptop terminal
```

For our demo, the laptop, ESP and Quest use the same phone hotspot. It must provide 2.4 GHz connectivity for this ESP8266. The Quest-to-laptop website route goes through the Internet/HTTPS tunnel; the laptop-to-ESP route stays on the local hotspot.

The ESP does not need to connect directly to Cloudflare. Its firmware listens on UDP port 4212 and currently accepts packets from the configured laptop IP. A DHCP address change or switching the laptop to another Wi-Fi network can break that local link even while a website still loads.

## 6. How does virtual contact generate feedback?

The headset application compares each tracked fingertip with the virtual object's collision shape. Our code supports spherical and oriented-box contact. A small contact-retention margin reduces flicker at the boundary.

When a valid fingertip touches an object, the application calculates a vibration amplitude and pattern for that finger. During a recognized grasp, the held core produces cues for the available fingers. The channel order is always:

```text
[Thumb, Index, Middle, Ring, Little]
```

Orbit Foundry has three cores:

| Core | Displayed virtual mass | Vibration request | Base load parameter |
|---|---:|---:|---:|
| Ion | 0.25 kg | 95/255 | 0.18 |
| Flux | 1 kg | 130/255 | 0.42 |
| Nova | 3 kg | 155/255 | 0.68 |

The virtual masses and load parameters are selected game values. They are not measurements of real load, tension or force.

While holding a core, each finger's resistance request depends on its curl, the core's load parameter and how far it was lifted. The current calculation is:

```text
request[i] = 100 × clamp(
    (core.load + 0.08 × normalizedLift) × (0.55 + 0.45 × fingerCurl[i]),
    0, 0.8
)
```

The result is smoothed and rounded, giving a dimensionless request between 0 and 80. Opening the hand, losing tracking or leaving VR clears the requests.

## 7. What exactly is transmitted?

The browser sends JSON to two same-origin HTTPS endpoints:

- `/api/cue`: source, hand, tracking availability, five vibration amplitudes and five patterns.
- `/api/grip-preview`: tracking/holding state, object identifier, grip mode, five resistance requests and the curl values captured at grasp.

Illustrative arrays, **not a live measurement**:

```text
VIB = [95, 95, 95, 95, 95]
RES% = [12, 14, 14, 14, 13]
HOLD = True
```

The Python relay validates the JSON fields and channel bounds. Desktop rehearsal is synthetic and is not allowed to supply nonzero hardware requests. The five-finger companion reads the latest accepted preview, converts it into a compact binary command and sends it over UDP to the ESP.

The ESP command contains session/boot information, a sequence number, a short lease, tracking/holding flags, five vibration values, five patterns and five resistance values. The captured reference-curl array is currently a browser/relay preview field; it is **not** used by the five-finger ESP controller to match real finger pose.

Packets use a shared pairing key and an HMAC-SHA256 authentication tag. Sequence and boot/session checks reject invalid or out-of-order packets. The ESP returns an authenticated receipt tied to the sent command. This distinguishes an actual board reply from a message that the laptop merely attempted to send.

The host loop targets 20 updates per second, but that is not a measured end-to-end rate. Browser requests are serialized per stream, and Internet/tunnel delays can reduce delivery frequency. End-to-end latency remains to be measured; hand animation can remain smooth locally while feedback delivery is slow or disconnected.

## 8. How do those requests reach motors and servos?

The ESP talks to the PCA9685 over I2C. In our wiring and firmware:

- PCA channels **0–4** provide the five servo control signals.
- PCA channels **8–12** provide the five motor-driver control signals.
- Each vibration motor uses its own transistor driver and flyback diode. The PCA signal controls the transistor; it does not supply motor power.
- The servo rotates a spool or horn attached to a tendon/thread. After mechanical calibration, bounded motion is intended to create finger resistance.

The servo mapping is:

```text
targetPulseUs[i] = homeUs[i] + pullDeltaUs[i] × resistance[i] / 80
```

The code ramps toward the target and enforces configured bounds and time limits. The sign and size of `pullDeltaUs` must reflect the actual tendon mechanism. Its current zero setting means no pull displacement is requested.

Vibration provides a tactile contact cue. Tendon loading is intended to provide finger resistance. This does not reproduce an object's full weight acting through the arm, and we do not currently measure tendon force. The servo system is **open loop with respect to finger tension/force**, even though the overall interface sends movement information outward and feedback requests back.

## 9. How do we show that communication really works?

Keep these three results separate:

1. **HTTP accepted:** the laptop relay accepted browser data.
2. **ESP receipt:** the paired ESP returned a valid reply to a command.
3. **Physical effect:** a motor actually vibrated or a servo produced a verified motion/resistance.

The terminal shows `ESP_LINK=LIVE` for fresh board replies and a separate `QUEST` status for fresh right-hand input. `VIB` and `RES%` are requested values. `PWM`, `SERVO_US`, arm masks and servo-signal masks describe firmware output state; they still do not measure physical motion or force.

`LAST_REASON=LINK_LOST` is a stored state/disarm reason and can remain visible after communication resumes. Fresh receipts are the evidence for current connectivity.

Firmware starts disarmed. Activation requires verified channels and a local serial action; public browser requests cannot arm the glove. Expired packets, STOP input and tracking/relay loss cause requests to clear or the controller to disarm. These checks do not replace physical validation of the tendon mechanism.

## 10. What can we show when the Quest is unavailable?

- Run the laptop desktop rehearsal to explain reaching, grasping, lifting and matching a dock. Label the hand as simulated.
- Use previously recorded genuine Quest/ESP evidence, clearly identified as an earlier run.
- Show an authenticated ESP connection check or fresh zero-command receipts to prove the laptop-to-board link independently.
- Show the glove and explain each signal/power path, without claiming untested physical feedback.

Desktop rehearsal does not prove current headset tracking and deliberately does not generate nonzero hardware requests.

## Short answers to likely technical questions

**What did your team build if Quest already tracks hands?**

We built the interaction/game logic, per-finger contact and resistance-request mapping, the browser-to-laptop relay, authenticated Wi-Fi delivery and receipts, and the bounded glove-controller architecture. Quest supplies the hand-tracking capability.

**Why use a laptop?**

It hosts the development website, runs the HTTPS tunnel, and translates validated browser requests into local ESP packets. This keeps browser, networking and actuator responsibilities separate.

**Why UDP?**

It supports small, frequently refreshed local packets. We handle loss with leases and validate identity/order using pairing authentication, sequence numbers and receipts; UDP itself does not guarantee delivery.

**Why did the link fail?**

The temporary tunnel stopped being valid, and the laptop had switched networks. Replacing the tunnel and restoring the hotspot repaired the checked routes. A stable hosted HTTPS endpoint or managed tunnel is a later deployment improvement.

**Do the percentages mean real kilograms or force?**

No. They are bounded software requests chosen for the game. Calibrated tendon-force feedback needs additional measurement and mechanical validation.

**Can you hold the real and virtual fingers in exactly the same pose?**

That is a future control objective. The current ESP servo controller maps resistance requests to bounded pulses; it does not close a feedback loop around measured finger pose or tension.

**How does this support the Tattva?**

The technical system creates a controllable artificial hand representation and prepares corresponding bodily cues. That allows us to explore agency and possible body ownership in a participant. It does not establish that the electronics are conscious or that ownership is guaranteed.

## Closing technical statement

"Quest supplies hand poses; our WebXR app turns those poses into virtual interaction; a Python gateway delivers per-finger requests to an authenticated ESP controller; and the prepared glove is designed to turn verified requests into vibration and bounded tendon motion. We have demonstrated tracking and board receipt. Physical-force validation is our next implementation stage."
