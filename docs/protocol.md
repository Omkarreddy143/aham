# AHAM wire protocol v1

Finger order is always **thumb, index, middle, ring, little**. Firmware, Python and Unity use the same contract and shared fixtures in `tests/fixtures/wire.txt`.

## Envelope

Raw bytes are little-endian. COBS-encode the complete raw packet and append one zero delimiter. Raw packets are limited to 64 bytes; a framed packet is at most 66 bytes. A UDP datagram contains exactly one complete framed packet. USB is a stream of framed packets; receivers recover at the next delimiter after corruption/overflow.

| Raw offset | Field | Size |
|---|---|---|
| 0 | Version, currently 1 | uint8 |
| 1 | Type: telemetry 1, haptic 2, control 3 | uint8 |
| 2 | Sequence | uint16 |
| 4 | Sender uptime/time counter in milliseconds | uint32 |
| 8 | Type-specific payload | variable |
| Last 2 bytes | CRC16-CCITT-FALSE over all preceding raw bytes | uint16 |

CRC parameters: polynomial `0x1021`, initial value `0xffff`, no reflection, no final XOR. Check vector `123456789` yields `0x29b1`.

## Telemetry: 33-byte payload

| Payload offset | Field |
|---|---|
| 0 | State uint8: disarmed 0, calibrating/reserved 1, armed 2, fault 3 |
| 1 | Flags uint16 |
| 3 | Fault uint8: none 0, stop 1, command timeout 2, unsupported pressure 3, sensor rail 4 |
| 4 | Five normalized curls uint16, each 0–1000 |
| 14 | Five raw flex ADC readings uint16 |
| 24 | Raw FSR uint16; zero in the default firmware configuration |
| 26 | Five currently applied vibration PWM duties uint8 |
| 31 | Capability bits uint16; starter sets bit 0 (vibration) only |

Flags: bit 0 valid calibration; bit 1 stop loop healthy; bit 2 flex readings off ADC rails; bit 3 command lease expired; bit 4 continuous-output limit reached; bit 5 simulated device. No IMU quaternion is included in v1: position/orientation are supplied separately by the VR tracker in a later integration.

The simulator's ADC readings and output duties are synthetic, not hardware measurements. The `simulated` bit allows Unity to identify that source. Simulator faults model behavior; actual embedded supervision is independently exercised by native tests.

## Haptic command: 15-byte payload

| Payload offset | Field |
|---|---|
| 0 | Lease uint16, accepted range 1–100 ms |
| 2 | Five intensity requests uint8, locally capped at 160 |
| 7 | Five patterns uint8: steady 0, spaced pulses 1, rough-associated cue 2, gentle cue 3 |
| 12 | Pressure target uint16; MUST be zero in this starter |
| 14 | Mechanical actuator mode uint8; MUST be zero in this starter |

Any nonzero pressure target/mode faults an armed device. The starter contains no servo actuation implementation.

Pattern 1 is on for 60 ms per 200 ms; pattern 2 alternates requested duty for 35 ms and one-third duty for 45 ms; pattern 3 applies half the requested duty. These are cue presets, not physical material reconstruction. Each uninterrupted nonzero request is limited to 2 seconds. A zero request resets that channel's duration limit.

Unity refreshes a complete five-channel command at approximately 50 Hz. Even a zero-contact state is transmitted while armed. At lease expiry output becomes zero; after 150 ms without an accepted refresh, firmware latches a fault. Restoring packets does not re-arm a faulted device.

## Control: 1-byte payload

Actions: disarm 0, arm 1, capture open 2, capture closed 3, clear fault 4. Capture actions use the latest averaged ADC samples and are permitted only while disarmed. Hold the pose still before capture. Open/closed spans must be at least 120 ADC counts on every finger, and captured/live readings must avoid the configured ADC rail guard.

Arming requires valid calibration, healthy stop loop, valid flex readings and no latched fault. Clearing a fault leaves the device disarmed. Calibration values persist in ESP32 Preferences after an accepted closed capture with a valid pair. Loaded calibration never automatically arms outputs.

All host control/haptic packets share one sequence counter. A delta in 1–32767 modulo 65536 is fresh; duplicates/backward packets do not refresh a lease. An explicit valid disarm is always accepted and establishes a new host sequence baseline, including after a host restart. It does not clear a fault. Only one controller may own the command stream at a time.

## Local transport

- USB: 230400 baud; use binary mode, not the text serial monitor.
- Host -> Unity telemetry: UDP `127.0.0.1:8765`.
- Unity -> host commands: UDP `127.0.0.1:8766`.
- Simulator dashboard: HTTP `127.0.0.1:8870`.

Run either the simulator or the USB bridge, never both on the same ports. The bridge opens an explicitly chosen serial device and never auto-arms. The dashboard belongs only to the simulator; it has no real-hardware output route.
