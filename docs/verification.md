# Starter verification — 7 October 2026

## Passed locally

- PlatformIO builds for `nodemcuv2` and `nodemcu_probe`, Espressif 8266 platform 4.2.1 / Arduino core 3.1.2, using Python 3.12.
- Retained `esp32dev` build, Espressif platform 6.12.0 / Arduino core 2.0.17. All three environments generated firmware images successfully.
- Eight Python tests covering active/legacy channel masks, CRC/check vectors, randomized frames, partial streams, corrupt/oversized recovery, simulator lease/replay behavior, stop handling, HTTP validation and a Unity-format UDP round trip.
- 60 native C++ assertions against the **actual firmware protocol and supervisor headers**, including single-finger calibration, inactive channels, disabled driver outputs, active sensor rail faults, no-sensor arming rejection, duty clamp, stale packets, lease expiry, stop, unsupported pressure, duration cap and clock/sequence wrap.
- Standalone C# protocol compilation and interoperability with four Python-generated golden frames, active/legacy masks, telemetry field offsets and CRC corruption checks.
- JavaScript syntax check for the simulator interface.
- Browser interaction: open/closed calibration, explicit arming, material selection, index contact output, paused command-link timeout, fault clearing and return to disarmed state.

## Still required

- Compile and play the Unity runtime/editor scripts in the teammate's actual Unity version; the standalone C# check covers the codec, not Unity-dependent scripts.
- Verify Unity trigger contacts and the physical arrangement of the primitive hand/blocks in play mode.
- Verify the received NodeMCU V3's A0 divider/range and module schematics; the software now targets ESP8266 rather than assuming ESP32.
- Upload only after board/wiring checks; observe real sensor ranges, stop behavior, motor current and driver polarity.
- Test the USB bridge with the actual device, including disconnect, reset and reconnect.
- Obtain Meta Quest 3, implement the XR pose/validity adapter and validate tracking/mounting.
- Measure physical motor onset; software framing tests are not an actuator-latency measurement.
- Build and validate a pressure mechanism before adding any servo actuation.

No hardware was flashed or actuated during this software milestone. No physical pressure, resistance or body-ownership result is claimed.

The kit has no divider resistors or motor driver yet. The shipped configuration advertises one index sensor and no enabled motor output; the probe requires all actuator supplies disconnected. Five physical flex channels, GSR acquisition and IMU orientation integration are not implemented on the single-ADC NodeMCU. See the revised hardware guide for the current limits.
