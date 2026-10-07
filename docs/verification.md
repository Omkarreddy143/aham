# Starter verification — 7 October 2026

## Selected WebXR revision

- **8 October — Wi-Fi data checkpoint:** `nodemcu_wifi_monitor` compiled for NodeMCU / ESP8266 Arduino core 3.1.2 (28,708 bytes RAM, 274,207 bytes flash). This is receive-and-print firmware with the index motor pin LOW, PCA9685 OE HIGH and no actuator driver/arming commands. No firmware was flashed during preparation.
- Thirty-seven Python tests completed: 36 passed, one Windows symlink-permission skip. Added Wi-Fi channel bounds, synthetic/stale/lost/released data suppression, private target validation, real loopback UDP receipt matching, bad receipt/output flag rejection, receipt expiry and sequence wrap. The relay's new accepted-data endpoint was tested separately from unconfirmed monitor receipts and expires cue/grip snapshots independently.
- Native C++ checks decoded a fixture from the actual Python encoder into the actual firmware header, then exercised duplicates, invalid fields, sequence wrap, timeout zeroing and a new sender session after expiry. Receipt output fields remain zero. The live laptop service's `/api/wifi-preview` endpoint returned monitor-only data after refresh.
- The team selected a 2.4 GHz phone hotspot. Actual hotspot joining, the configured ESP IP, flashed-device UDP receipts and timing remain to be tested using [the Wi-Fi guide](wifi-quickstart.md). Local hotspot credentials belong only in ignored `WifiSecrets.h`; no credentials or compiled binary are included in the Wi-Fi ZIP.

- Orbit Foundry v3: the team now confirms whole-hand Quest tracking and cue values. Added right-hand grasp/pinch, palm-relative carry/rotation, matching-dock delivery, 75-second scoring, combos and a reachable in-world restart. New gameplay still needs a headset play-through; desktop rehearsal demonstrated a heavy-core grab, increased requests during lift, release to zero and a 200-point dock delivery. [Desktop game proof](images/webxr-foundry.jpg)
- Thirteen JavaScript tests pass: existing five tracking/contact tests plus eight game tests covering proximity/open gating, pinch hysteresis, rigid object carry, lift/matching-dock scoring once, combos, weight-dependent bounded requests, preview suppression, loss/reacquisition, frame gaps, round end, bounded throws and missing/degenerate joints.
- Thirty Python tests pass except one Windows symlink-permission skip (29 passed). The three new grip-preview checks prove expiring five-channel storage, strict validation, origin enforcement, release/preview/loss zeroing and **no UDP or actuator packet output** from the resistance endpoint.
- Desktop rehearsal now submits no requests, avoiding competition with the live Quest; server-side synthetic suppression remains. The existing temporary HTTPS link was retained and the monitor service refreshed. Board telemetry continued to report disarmed state, motor mask 0 and zero vibration. No firmware was flashed and no actuator output enabled.
- Servo-request percentages and captured optical curls are previews, not measured tension or calibrated servo positions. Physical servo feedback remains pending the mechanism, release, power and actuator-only firmware described in [the resistance plan](servo-resistance-plan.md).

- Full-hand v2: five JavaScript tests passed, including independent cues for all five fingertips, per-finger loss, both 25-joint XR input sets, wrist translation, and preview suppression. The browser preview demonstrated five Smooth cues simultaneously, middle-finger-only contact and the left feedback hand. Both meshes and all five controls render. The team's live Quest session worked for the index starter; full-hand v2 still needs its headset reload/check. [Desktop proof](images/webxr-full-hand.jpg)

- Three.js r180 is vendored with its MIT license. The desktop browser preview produced Smooth 100/pattern 1, Rough 150/pattern 2 and Soft 80/pattern 3 contact cues; preview sends only zero monitor output. Returning to open clears contact.
- Three JavaScript tests passed for angle-based curl, fingertip contact/tracking loss, and synthetic-output suppression.
- Seventeen relay tests passed except one skipped Windows symlink test: sixteen passed. Checks include exact submitted-packet echo matching, bounded receipt history, expiry, malformed requests/frames, static-file confinement and exact external HTTPS origin validation. Existing Python checks also passed.
- Tracking loss queues a zero cue after an in-flight request; client receipts expire by age, and ending VR restores the desktop camera. These paths received code review; actual headset session transitions remain to be exercised.
- The approved temporary Cloudflare tunnel connected using HTTP2/IPv4. The headset must still demonstrate real hand poses, in-world panel visibility, contact placement, fitted-glove tracking and delay.
- The public HTTPS page loaded in the laptop browser and its API accepted requests with the configured external origin. A matching preview-zero monitor echo and real board telemetry appeared on the page. The board reported disarmed state, motor mask 0 and zero vibration. CLI DNS lookup of the temporary URL timed out, while browser access worked. [Browser proof](images/webxr-preview.jpg)
- No new firmware was flashed or actuator output enabled. Current sensor-calibration firmware requires a new actuator-only mode before external tracking can drive hardware. Servo control remains unimplemented.

The earlier Unity and hardware checks below remain a record of the fallback path.

## Passed locally

- Refined hand/scene: Unity batch compilation and rendering passed. Physics overlap checks verified the actual index-tip collider reaches each of the three selected target colliders at half curl; the open index overlaps none. Rendered open, bent, tilted and contact poses were inspected. Runtime GUI and trigger-event interaction still require the team's Play-mode check.

- Unity cue monitor: ten Python tests passed, including monitor UDP receipt, malformed/control packet rejection and cue validation. C# cue parsing and actual Unity script compilation passed. The separate monitor echoes to Unity only and has no serial route. Live contact-triggered nonzero cue receipt still needs the team's interactive demonstration.

- PlatformIO builds for `nodemcuv2` and `nodemcu_probe`, Espressif 8266 platform 4.2.1 / Arduino core 3.1.2, using Python 3.12.
- Retained `esp32dev` build, Espressif platform 6.12.0 / Arduino core 2.0.17. All three environments generated firmware images successfully.
- Arduino IDE exports `AhamIndex.ino` and `FlexCheck.ino` were converted from sketch format, compiled and linked for NodeMCU using PlatformIO / ESP8266 Arduino core 3.1.2. Both produced firmware images. This verifies compilation, not an Arduino IDE upload or a physical sensor/motor test.
- Nine Python tests covering active/legacy channel masks, CRC/check vectors, randomized frames, partial streams, corrupt/oversized recovery, simulator lease/replay behavior, stop handling, HTTP validation and a Unity-format UDP round trip.
- 60 native C++ assertions against the **actual firmware protocol and supervisor headers**, including single-finger calibration, inactive channels, disabled driver outputs, active sensor rail faults, no-sensor arming rejection, duty clamp, stale packets, lease expiry, stop, unsupported pressure, duration cap and clock/sequence wrap.
- Standalone C# protocol compilation and interoperability with four Python-generated golden frames, active/legacy masks, telemetry field offsets and CRC corruption checks.
- Unity 6000.6.4f1 imported the standalone project and compiled both the actual runtime and editor scripts. Batch execution of `Aham.AhamSetup.Create` saved `Assets/AHAM/Scenes/AhamStarter.unity` and exited with code 0. Project settings and package lock were generated by the installed editor.
- JavaScript syntax check for the simulator interface.
- Browser interaction: open/closed calibration, explicit arming, material selection, index contact output, paused command-link timeout, fault clearing and return to disarmed state.
- Real NodeMCU USB communication on **COM7 / CH340**: 199 valid telemetry packets decoded in a two-second capture at 230400 baud. State was disarmed, fault 0, sensor mask 2, motor mask 0 and all vibration outputs zero. The USB bridge was then started for Unity; the team's screenshot confirmed **USB glove via local bridge**. This verifies communication, not correct sensor wiring/calibration.
- The bridge's optional `--stats` mode printed one-second raw min/max ranges from real telemetry while forwarding to Unity; a window ranged from 0 to 520 over 100 samples. The team later confirmed nothing was connected to NodeMCU; these were floating-input readings, not flex measurements. Physical sensor stability remains untested. Eight Python tests passed after adding the diagnostic logging.

- New MPU6050 raw acquisition compiled for NodeMCU and ESP32. Signed 13-byte IMU packets and gravity tilt calculations passed Python/C# checks.
- Unity batch rendering exercised the actual hand rig in open, bent and tilted poses and exited successfully. The proof images show different joint/root transforms. Default Play preview and manual controls are implemented; interactive GUI/contact checks remain to be done.

## Still required

Update after bench bring-up: the team reports the 22 kOhm / 33 kOhm / 10 kOhm divider is connected, real flex readings update in Unity, and the virtual index finger follows bending after calibration. The local bridge observed stable 228–232 readings while stationary. This establishes the first sensor-to-Unity milestone; physical vibration and MPU6050 remain untested.

- Play the updated scene in the interactive Unity editor; verify auto preview/manual controls, GUI layout and live simulator connection. Rendered hand poses are verified, but GUI interaction/runtime contacts are not.
- Wire the actual MPU6050 breakout and verify slow tilt, neutral centering and disconnected/stale behavior. No physical IMU samples have been tested.
- Verify Unity trigger contacts and the physical arrangement of the primitive hand/blocks in play mode.
- Verify the received NodeMCU V3's A0 divider/range and module schematics; the software now targets ESP8266 rather than assuming ESP32.
- Upload only after board/wiring checks; observe real sensor ranges, stop behavior, motor current and driver polarity.
- Complete USB disconnect, reset and reconnect tests; basic real telemetry/Unity connection is verified above.
- Obtain Meta Quest 3, implement the XR pose/validity adapter and validate tracking/mounting.
- Measure physical motor onset; software framing tests are not an actuator-latency measurement.
- Build and validate a pressure mechanism before adding any servo actuation.

No hardware was flashed or actuated during this software milestone. No physical pressure, resistance or body-ownership result is claimed.

The team confirms resistors arrive after 6 PM; a 2N2222A is available, but divider values, transistor pinout, motor startup current and the completed circuit remain unverified. The motor is reported as 10 mm / 3 V. The shipped configuration advertises one index sensor and no enabled motor output; the probe requires all actuator supplies disconnected. Five physical flex channels, GSR acquisition and robust IMU orientation fusion are not implemented on the single-ADC NodeMCU. See the revised hardware guide for the current limits.
