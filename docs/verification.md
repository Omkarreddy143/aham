# Starter verification — 7 October 2026

## Passed locally

- PlatformIO build for `esp32dev`, Espressif platform 6.12.0 / Arduino core 2.0.17.
- Embedded image generation: 22,008 bytes RAM and 292,029 bytes application flash in the first successful build.
- Seven Python tests covering CRC/check vectors, randomized frames, partial streams, corrupt/oversized recovery, simulator lease/replay behavior, stop handling, HTTP input/origin validation and a Unity-format UDP round trip.
- 51 native C++ assertions against the **actual firmware protocol and supervisor headers**, including duty clamp, stale/duplicate packets, lease expiry, fault clearing, physical stop, sensor rails, unsupported pressure, duration cap, clock wrap and sequence wrap.
- Standalone C# protocol compilation and interoperability with four Python-generated golden frames, telemetry field offsets and CRC corruption checks.
- JavaScript syntax check for the simulator interface.
- Browser interaction: open/closed calibration, explicit arming, material selection, index contact output, paused command-link timeout, fault clearing and return to disarmed state.

## Still required

- Compile and play the Unity runtime/editor scripts in the teammate's actual Unity version; the standalone C# check covers the codec, not Unity-dependent scripts.
- Verify Unity trigger contacts and the physical arrangement of the primitive hand/blocks in play mode.
- Confirm the received ESP32 board and review/change the provisional pin map.
- Upload only after board/wiring checks; observe real sensor ranges, stop behavior, motor current and driver polarity.
- Test the USB bridge with the actual device, including disconnect, reset and reconnect.
- Identify the headset/controller model, implement the XR pose/validity adapter and validate the tracker mount.
- Measure physical motor onset; software framing tests are not an actuator-latency measurement.
- Build and validate a pressure mechanism before adding any servo actuation.

No hardware was flashed or actuated during this software milestone. No physical pressure, resistance or body-ownership result is claimed.
