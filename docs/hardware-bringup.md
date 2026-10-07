# Received hardware: start with NodeMCU

**Selected scope: one index finger first.** Use the [index-finger milestone](index-finger-mvp.md); external ADCs/ESP32 replacement and four more drivers are later expansion parts, not prerequisites for this version.

**Latest status:** the team reports uploading the full Unity-compatible sketch using PlatformIO. Use [the post-upload steps](platformio-after-upload.md). The previously reported 3 V motor rating is now questioned as possibly 5 V; verify the supplier rating before any motor-power test. Neither USB input voltage nor the linked tutorial establishes the received motor's rating.

Confirmed: **ESP-12E NodeMCU V3 (ESP8266)**, five flex sensors, MPU6050, PCA9685, four MG90S servos, one SG90, Grove GSR, one coin motor reported as **10 mm / 3 V**, PAM8403, glove, breadboard and **5 V / 2 A adapter**. Four more motors are pending. A **2N2222A** has been identified and resistors are visible in the supplied photos; transistor pinout and resistor values are unverified. A flyback diode, regulated 3 V motor supply and extra ADC/multiplexer have not been confirmed available. Meta Quest 3 arrives later; use the Unity desktop path now.

**Default firmware: NodeMCU, one index-finger ADC channel, zero enabled motor outputs.** No hardware has been flashed or physically verified by this repository.

## What the kit can do

| Part | Role and current limit |
|---|---|
| NodeMCU V3 | USB telemetry/control; only one A0 input |
| Five flex sensors | Each needs a fixed-resistor divider; start with index after obtaining resistors |
| MPU6050 | I2C identification now; orientation fusion later. Cannot supply reliable hand XYZ position or absolute yaw |
| PCA9685 | I2C identification now; servo signal generator, not a power supply |
| MG90S x4 / SG90 x1 | Reserve for off-hand mechanism experiments; no servo motion is implemented |
| One coin motor, reported 10 mm / 3 V | Index cue after type/current, regulated 3 V supply and driver are verified |
| Grove GSR | Analog output, competes for A0; postpone logging until more analog inputs are available |
| PAM8403 | Stereo audio amplifier; leave out of the DC motor circuit |
| 5 V / 2 A adapter | Do not assume five loaded servos can run from it; assess one servo at a time off-hand |

ESP8266 has one ADC with a **0–1 V bare-chip range**. Some boards include an A0 divider; the label V3 does not establish its range. [ESP8266 ADC reference](https://arduino-esp8266.readthedocs.io/en/latest/reference.html#analog-input) Grove GSR produces an analog resistance-related output, not a direct body-ownership measurement. [Seeed documentation](https://wiki.seeedstudio.com/Grove-GSR_Sensor/) PAM8403 is a Class-D audio amplifier. [Manufacturer](https://www.diodes.com/part/view/PAM8403/)

## Parts to request now

The fastest route to five fingers is a **classic ESP32 DevKit** replacement plus divider resistors and motor drivers. Five flex sensors plus GSR require six suitable analog inputs; check the GSR output voltage separately. If retaining NodeMCU, request **two ADS1015 breakout boards** with 3.3 V logic/pull-ups and different addresses (for example 0x48/0x49). Each has four single-ended inputs; one board cannot read five flex sensors. That alternative needs a new acquisition driver and is not implemented here. [TI datasheet](https://www.ti.com/lit/ds/symlink/ads1015.pdf)

For one index channel obtain:

- Approximately 22 kOhm fixed resistor for the flex divider, plus 27 kOhm and 10 kOhm for conservative A0 attenuation below. Adjust to actual sensor range.
- For the available 2N2222A, obtain a flyback diode, 10 kOhm base pulldown and series-base resistors for selection after checking startup current; follow the [NPN alternative](index-finger-mvp.md#npn-alternative-with-the-available-parts). If using a MOSFET instead, choose one specified for the motor current at a 3.3 V gate, with approximately 100 Ohm gate resistor and 100 kOhm gate pulldown. These are different circuits. Later obtain five verified driver sets total.
- An external regulated **3 V** motor supply, or a step-down regulator from the 5 V adapter to 3 V, with adequate verified startup-current capacity. Measure its output before connection. Do not connect the reported 3 V motor directly to 5 V.
- Normally closed stop switch, jumper wires/connectors, suitable power wiring and a multimeter. A breadboard supplies no connections by itself.
- For future PCA9685 use, an OE pull-up to 3.3 V (for example 10 kOhm), after checking existing breakout pulls.

If extras do not arrive, demonstrate the desktop simulator plus board/I2C identification. Do not claim five physical measurements from simulated data.

## NodeMCU pin map

| Function | Board label | GPIO |
|---|---|---|
| Index flex only | A0 | Sole ADC |
| I2C SDA | D2 | 4 |
| I2C SCL | D1 | 5 |
| Index motor control, disabled by default | D5 | 14 |
| Normally closed stop loop to GND | D6 | 12 |
| PCA9685 OE, HIGH disables signals | D7 | 13 |

Avoid D3/D4/D8 for this starter because of boot strapping. Constants are in `firmware/include/BoardConfig.h`; PlatformIO's `nodemcuv2` target is ESP-12E NodeMCU and applies to this V3 form factor. [Board reference](https://docs.platformio.org/en/stable/boards/espressif8266/nodemcuv2.html)

## First test with the existing kit: USB and I2C

1. Leave the adapter, servos, coin motor, flex sensors and GSR disconnected. Connect NodeMCU by USB data cable.
2. Build the text diagnostic, upload to the verified port, then open its monitor:

   ```powershell
   .\.venv\Scripts\python.exe -m platformio run --project-dir firmware -e nodemcu_probe
   .\.venv\Scripts\python.exe -m platformio run --project-dir firmware -e nodemcu_probe --target upload --upload-port COM5
   .\.venv\Scripts\python.exe -m platformio device monitor --port COM5 --baud 115200
   ```

   `COM5` is an example. Identify the actual board port. Upload replaces existing board firmware. Do not run the binary USB bridge with this text program.
3. Confirm the `AHAM NODEMCU PROBE` message. Floating A0 values are **not** flex measurements. Unplug USB before rewiring.
4. Check the breakout voltage labels/schematic; use confirmed 3.3 V-compatible supplies and pull-ups. Connect GND to GND, D2 to SDA, D1 to SCL. Test MPU6050 alone first; then add PCA9685 logic **VCC** at 3.3 V. Leave servo **V+** unpowered and every servo unplugged. Never let SDA/SCL pull-ups rise to 5 V.
5. Reconnect/reset. MPU should acknowledge at 0x68/0x69 with WHO_AM_I = 0x68. PCA9685 normally acknowledges at 0x40 with unchanged address jumpers; additional addresses may appear. ACK is identification, not full functional validation. [MPU register map](https://invensense.tdk.com/wp-content/uploads/2015/02/MPU-6000-Register-Map.pdf)

The probe commands no servo PWM. Neither firmware currently transmits IMU orientation or GSR readings.

## One flex sensor after resistors arrive

Connect **3.3 V -> flex -> node X -> 22 kOhm -> GND**. For an unverified A0 range, add **X -> 27 kOhm -> A0 -> 10 kOhm -> GND**. At X = 3.3 V this limits A0 to about 0.892 V before any board attenuation. The extra network loads the divider; calibrate the assembled circuit. Verify voltage with a meter before connecting A0. If the board already attenuates A0, the signal may be too small: check its schematic and revise the divider rather than removing protection blindly.

Do not connect flex directly between supply and A0, or connect GSR output to the same node.

Build/upload `nodemcuv2` per quickstart. A0 is read every 10 ms; its 10-bit count is scaled to the protocol's 0–4095 range in **index slot 1**. Other raw/curl slots stay zero. Calibration requires at least 120 scaled counts of open/closed span on the enabled channel and rejects rail readings. Checksummed EEPROM calibration persists without auto-arming.

D6 connects through a normally closed stop switch to GND. An open/broken loop blocks arming and faults active output. A temporary GND jumper is acceptable for off-hand sensor-only bench checks; use a real switch before wearable motor operation.

## One coin motor after driver parts arrive

If MOSFETs are unavailable, use the [NPN alternative](index-finger-mvp.md#npn-alternative-with-the-available-parts). The reported NPN is **2N2222A**; manufacturer/package, physical lead order and motor running/startup current still need confirmation. The team reports a **10 mm / 3 V** coin vibrator; verify DC/ERM type before using either switching circuit. Follow the [3 V supply instructions](index-finger-mvp.md#supply-for-the-reported-3-v-motor). The NPN pin connections and resistor sizing differ from the MOSFET circuit below. Keep motor output disabled until a suitable circuit is verified.

- Motor positive -> external regulated 3 V supply for the reported motor.
- Motor negative -> MOSFET drain; source -> actuator ground.
- D5 -> approximately 100 Ohm -> gate; gate -> approximately 100 kOhm -> GND.
- Flyback diode cathode -> motor positive, anode -> drain; verify actual ratings/polarity.
- Common signal ground to NodeMCU; actuator current returns through suitable power wiring.

Never power a motor from GPIO or the NodeMCU 3.3 V regulator. Verify the circuit off-hand with a current-limited suitable source, including stop behavior. Then set `motorDriverVerified = true` in `BoardConfig.h`, rebuild and upload with actuator supply disconnected. This enables only the index driver on NodeMCU. PWM ceiling is 160/255; lease at most 100 ms; fault at 150 ms without accepted refresh; continuous cues stop after two seconds. These limits do not establish correct supply/current.

## Servos and the 2 A adapter

Keep servo power disconnected for this starter. PCA9685 generates signals; it does not increase available current. The 5 V / 2 A label is an adapter maximum, not evidence of adequate transient capacity for five loaded servos. No stall-current specification is assumed for the received variants.

Plan a separate off-hand, one-servo experiment after checking adapter regulation, servo type/travel, power distribution and voltage/current under load. Do not route servo current through NodeMCU or thin breadboard rails. A worn mechanism also needs bounded travel, a compliant load path, direct release and appropriate feedback sensing; no FSR was received. Cutting power or OE does not guarantee geared-servo release.

## ESP32 alternative

If a **classic ESP32 DevKit** is obtained, select `-e esp32dev`. Retained map: flex32/33/34/35/36, motors18/19/23/25/26, stop27, PCA OE13. Each flex needs a divider. Motor output also defaults disabled; verify all installed drivers before enabling the five-channel configuration. Pins do not apply automatically to ESP32-C3/S3. [Espressif GPIO reference](https://documentation.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/peripherals/gpio.html)

Record actual wiring, voltages and tests. Compilation does not validate received modules, driver polarity, load current or sensation.
