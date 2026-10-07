# Hardware bring-up: vibration-first starter

Components and headset model are not yet confirmed. The following is a **provisional classic ESP32 DevKit** wiring plan. Check the received board, motor ratings, breakout schematics and actual pin labels first. No hardware upload or actuator test has been performed by this software build.

| Function | Provisional GPIO |
|---|---|
| Flex: thumb/index/middle/ring/little | 32 / 33 / 34 / 35 / 36 |
| Vibration: thumb/index/middle/ring/little | 18 / 19 / 23 / 25 / 26 |
| Optional FSR input, disabled by default | 39 |
| Normally closed stop loop | 27 |
| Reserved PCA9685 output-disable signal | 13 |

These pin assignments are in `firmware/include/BoardConfig.h`. They do not apply automatically to ESP32-C3/S3 or boards with different exposed pins. GPIO34/35/36/39 are input-only on the classic ESP32 and have no internal pull-up/pull-down for divider use; use actual external divider resistors. [Espressif GPIO documentation](https://documentation.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/peripherals/gpio.html)

## Flex input

For each finger: **3.3 V -> flex sensor -> ADC node -> fixed resistor -> GND**. Connect that ADC node to its assigned input. A 22 kOhm fixed resistor is a starting choice, to be adjusted for the actual sensor range. Keep all input voltages inside the board's ADC/input ratings and away from saturation; raw counts are not assumed linear voltage measurements.

Bending can decrease the ADC reading in this divider. The normalization handles either sign of the open/closed span. The firmware samples each channel eight times per acquisition and transmits at approximately 100 Hz. The minimum calibration span is 120 counts per finger.

Start with only sensor power and USB. Check that each finger's assigned reading changes smoothly. Confirm finger identity before connecting actuator power.

## Motor driver, repeated five times

- Motor positive -> supply at the motor's rated voltage.
- Motor negative -> drain of a MOSFET specified to switch adequately with a 3.3 V gate.
- MOSFET source -> actuator ground.
- Assigned ESP32 GPIO -> approximately 100 Ohm gate resistor -> gate.
- Gate -> approximately 100 kOhm pulldown -> ground.
- Flyback diode: cathode to motor positive, anode to MOSFET drain; select it for the actual motor current.
- ESP32 ground -> common ground, with motor current returned through appropriate power wiring.

The GPIO provides a control signal only. Do not connect the motor directly to it. A 3 V motor needs a suitable supply rather than automatic connection to the requested 5 V rail. Verify MOSFET orientation and diode polarity with the actual component datasheets.

The firmware caps requests at PWM duty 160/255. This is an initial software ceiling, not a measured physical intensity limit; validate motor startup, current and comfortable cue levels on the bench.

## Stop loop and mechanical outputs

Wire GPIO27 through a **normally closed** stop switch/loop to GND. Opening the switch, removing the connection or breaking the loop gives HIGH via the pull-up and blocks/latches active output. Verify that behavior explicitly. Use a real stop switch for the wearable; do not treat a permanent wire jumper as the final release arrangement.

Keep servos disconnected from power in this starter. GPIO13 is reserved and driven HIGH to disable a future PCA9685 signal generator; pressure PWM/force control is not present. If a PCA9685 is connected later, verify its OE pull-up and any on-board pull-down so signals remain disabled during MCU boot. Signal disable does not cut servo power or guarantee release.

The FSR flag is initially disabled and no FSR limit is used to authorize servo movement. Mechanical pressure integration is a later milestone requiring a calibrated load path, bounded travel, a direct quick release and bench testing.

## First powered checks

1. Confirm actual board, all divider inputs, supply voltage and common ground.
2. Build and upload the firmware with motor/servo power disconnected.
3. Start the local USB bridge and inspect raw sensor values in Unity.
4. Capture open/closed calibration while disarmed; reject saturated or insufficient-span channels.
5. Test one motor/driver off-hand using a current-limited suitable supply, then the remaining channels.
6. Verify stop loop, command-link expiry and device restart all remove vibration requests.
7. Only after those checks, mount the vibration motors and repeat low-intensity contact cues.

Record the actual wiring and test results. Compilation and simulation do not verify physical driver polarity, load current, motor sensation or mechanical safety.
