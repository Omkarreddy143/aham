# Five-finger vibration + servo wiring and code

Use **ESP-12E NodeMCU V3 / ESP8266**, one **PCA9685**, five **3 V coin motors**, four **MG90S** and one **SG90**. Quest provides hand tracking; flex sensors and MPU6050 are not needed for this mode. **The existing VR website stays unchanged.** A new local laptop sender forwards all five existing values to the new firmware.

Download [AHAM-Five-Finger-Hardware.zip](../artifacts/AHAM-Five-Finger-Hardware.zip). It contains the complete ESP source, PlatformIO project, laptop sender, configuration examples and this guide. [ESP source](../firmware/src/wifi_glove.cpp), [controller](../firmware/include/GloveController.h), [output planner](../firmware/include/GloveOutputs.h), [laptop sender](../host/aham/wifi_glove.py).

**Current status:** software compiles and software tests pass. Physical motors, servos, power, tendon tension and release have not been tested. The diode and actuator supplies still need to be obtained/confirmed. Both verification masks ship as **0**, so every actuator is disabled. You can wire with power disconnected now and choose the V+ source later.

## 1. Parts for the complete glove

| Part | Quantity / use |
|---|---|
| NodeMCU ESP8266 | 1; USB powers logic and Wi-Fi |
| PCA9685 | 1; control signals for all ten actuators |
| MG90S | 4; thumb, index, middle, ring |
| SG90 | 1; little finger; check its behavior separately |
| Rated 3 V coin motor | 5; one per fingertip |
| 2N2222A NPN transistor | 5; one motor driver each |
| 330 ohm resistor | 5; one transistor base resistor each |
| 10 kohm resistor | 5; one base-to-emitter pull-down each |
| 1N4007 diode | 5; one flyback diode across each motor |
| 1 kohm resistor | 1; PCA OE pull-up to NodeMCU 3V |
| Suitable separate regulated 5 V source | Servo V+; source/current rating still to be selected |
| Suitable separate 3 V source | Five coin motors; current rating still to be selected |
| Normally closed switch / removable wire loop | Local STOP from D6 to GND |
| Wires, insulated joints, soft attachment and mechanical release | Keep moving wires clear of servo horns and fingers |

Start with the parts you have: one index motor and one index servo. The firmware supports unused channels remaining disconnected and disabled.

## 2. Three power connections, one common ground

| Rail | Connection | What it powers |
|---|---|---|
| Laptop USB | NodeMCU USB connector | NodeMCU |
| NodeMCU pin marked **3V** | PCA **VCC** | PCA control chip and 3.3 V I2C logic only |
| Separate regulated **+5 V** | PCA top screw terminal **V+** | Five servo red wires |
| Separate suitable **+3 V** | Five motor positive wires | Five reported 3 V coin motors |
| All negatives / **GND** | Join together | Common signal reference |

PCA **VCC and V+ are different rails**. Its VCC operating range does not specify the servo's supply range; TowerPro lists 4.8 V operation for these servos. Use a suitable 5 V servo supply, while PCA VCC uses the NodeMCU logic rail. Do not power servos or the complete motor bank from the NodeMCU 3V pin. [PCA power guide](https://learn.adafruit.com/16-channel-pwm-servo-driver/hooking-it-up), [MG90S](https://towerpro.com.tw/product/mg90s-3/), [SG90](https://towerpro.com.tw/product/sg90-7/)

You **can use the top-middle V+ screw terminal**. On standard boards it feeds the same servo V+ rail as the channel "+" pins; verify the labels/continuity on your module. Feed the source's positive to **V+**, negative to **GND**. The header V+ pin is an alternative input to that same rail, not another voltage setting. Do not join V+ to VCC.

Leave V+ disconnected until you choose the source. For your round-plug adapter, obtain a **female barrel-jack to screw-terminal connector matching the actual plug** and check polarity with a meter. The existing 5 V / 2 A adapter is not a verified supply for five simultaneously loaded servos. Measure startup/loaded current and choose a supply with headroom. A small rectangular 9 V battery is a poor choice for this load; adding a buck converter cannot increase its available power. Route servo/motor current directly through suitable distribution wiring, not through the NodeMCU or thin breadboard paths.

An optional correctly polarized 470–1,000 uF capacitor of at least 10 V rating near servo V+/GND may reduce dips. It cannot replace sufficient supply current. Keep a reachable disconnect/switch for actuator power.

## 3. NodeMCU to PCA9685

Disconnect USB and actuator power while wiring.

| NodeMCU / component | PCA9685 / destination |
|---|---|
| **3V** | **VCC** |
| **GND** | **GND** |
| **D2 / GPIO4** | **SDA** |
| **D1 / GPIO5** | **SCL** |
| **D7 / GPIO13** | **OE** |
| **1 kohm resistor** | Between **OE** and NodeMCU **3V** |
| **D6 / GPIO12** | Normally closed STOP switch / removable loop to **GND** |
| **D5 / GPIO14** | Unused in this version; disconnect the old index motor base wire |

Address jumpers stay unset: **0x40**. Check that I2C pull-ups are connected to PCA VCC/3 V, not servo 5 V. OE HIGH disables all PCA signals. Verify the external pull-up actually makes OE HIGH during reset; some modules have an OE pull-down/jumper that must be corrected. The HIGH threshold is 0.7 x VCC. Firmware sets all channels OFF at startup. [PCA9685 datasheet](https://cdn-shop.adafruit.com/datasheets/PCA9685.pdf)

Keep the D6-to-GND loop closed to permit a local arm. Opening it disarms. **A software stop or OE HIGH does not disconnect servo power and cannot guarantee a taut thread becomes slack.** A mechanical release and power disconnect are separate requirements.

## 4. Connect the five servos

The arrays, configuration and wiring all use **thumb, index, middle, ring, little** order.

| Finger | Servo channel | Suggested servo | Vibration control channel | Verification bit |
|---|---:|---|---:|---:|
| Thumb | **0** | MG90S | **8** | 1 |
| Index | **1** | MG90S | **9** | 2 |
| Middle | **2** | MG90S | **10** | 4 |
| Ring | **3** | MG90S | **11** | 8 |
| Little | **4** | SG90 | **12** | 16 |

For each servo plug:

| Servo wire | Its channel's pin |
|---|---|
| Brown / black | **GND / -** |
| Red | **V+ / +**, the separate 5 V rail |
| Orange / yellow / white | **S / PWM**, the signal |

Use the printed pin labels; do not guess connector orientation. Leave horns unobstructed and **all finger threads detached** for initial tests. A power-on/home pulse can move an uncalibrated servo unexpectedly even before you request resistance.

## 5. Build this motor driver FIVE times

Use one transistor, two resistors and one diode for **each** motor. Identify the transistor's actual **B (base), C (collector), E (emitter)** from its exact manufacturer's package datasheet. The marking 2N2222A alone is insufficient to assume a left-to-right lead order. [ST 2N2222A](https://www.st.com/resource/en/datasheet/2n2222a.pdf), [onsemi P2N2222A](https://www.onsemi.com/download/data-sheet/pdf/p2n2222a-d.pdf)

```text
                 SEPARATE +3 V MOTOR RAIL
                          |
                +---------+----------+
                |                    |
             motor +          1N4007 BANDED end
              [motor]                |
             motor -          1N4007 unbanded end
                |                    |
                +---------+----------+
                          |
                          C
PCA channel S ---330 ohm---B   2N2222A
                          E
                          |
                       common GND

Also connect 10 kohm BETWEEN B and E of that transistor.
```

Exact connection list for every motor:

1. Motor positive (usually red) -> **separate +3 V motor rail**.
2. Motor negative (usually blue/black) -> transistor **C**.
3. Transistor **E** -> **common GND**.
4. Its PCA channel **S** -> **330 ohm** -> transistor **B**.
5. **10 kohm** -> between transistor **B** and **E/GND**.
6. Diode **banded end/cathode** -> motor positive / +3 V.
7. Diode **unbanded end/anode** -> motor negative / transistor C.

| Driver | PCA signal connection |
|---|---|
| Thumb transistor base resistor | **Channel 8 S** |
| Index transistor base resistor | **Channel 9 S** |
| Middle transistor base resistor | **Channel 10 S** |
| Ring transistor base resistor | **Channel 11 S** |
| Little transistor base resistor | **Channel 12 S** |

**Use only the S pin of channels 8–12. Their "+" pins carry servo V+, normally 5 V: do not connect a 3 V coin motor to them.** Channels 5–7 and 13–15 remain unused/OFF. The index motor now uses **channel 9 S**, replacing old D5 control.

One PCA has **one shared PWM frequency**, so both the servos and these motor drivers run at approximately **50 Hz**. This is a demo compromise and may produce more pulsed vibration than the earlier 1 kHz index circuit. Do not increase this PCA's frequency while servos are attached. A later separate motor controller / second PCA could use a different frequency. [PCA9685 datasheet](https://cdn-shop.adafruit.com/datasheets/PCA9685.pdf)

PCA signal pins supply only base-control current. The original Adafruit board includes **220 ohm output series resistors**, so an external 330 ohm adds to them if your module has them. Actual motor current, startup, transistor saturation and heating must be checked: this circuit is not a guarantee that every coin motor will start at the available base current. Never remove the base resistor or diode to compensate. [Adafruit board details](https://www.adafruit.com/product/815)

## 6. Prepare the PlatformIO project

Extract the new five-finger ZIP into a **new folder**; keep all folders together. Open its **firmware** folder in VS Code. Its default PlatformIO environment is **nodemcu_wifi_glove**. In the full repository, explicitly select that environment; the legacy default is still sensor firmware.

The main source is **firmware/src/wifi_glove.cpp**, with its supplied headers. Do not copy just this file over the old main.cpp. PlatformIO's build filter selects it; no external servo/PCA library installation is required.

In a terminal at the ZIP/repository root:

```powershell
python tools/setup_wifi_bench.py --five-finger
```

This generates a private pairing key for the ESP/laptop and copies **GloveConfig.example.h** to ignored **GloveConfig.h**. Existing pairing files/configuration are retained. Keep generated keys and passwords local.

Copy **firmware/include/WifiSecrets.example.h** to **WifiSecrets.h** and enter locally:

- The same 2.4 GHz hotspot name/password that already worked.
- The laptop's current hotspot **Wi-Fi IPv4**, not the Cloudflare address or ESP IP.

The firmware and laptop sender must use the same generated key. Do not mix files from different extracted folders.

Default **GloveConfig.h** contains:

```cpp
namespace glove_config {
constexpr uint8_t motorVerifiedMask = 0;
constexpr uint8_t servoVerifiedMask = 0;
constexpr uint16_t homeUs[5] = {1500, 1500, 1500, 1500, 1500};
constexpr int16_t pullDeltaUs[5] = {0, 0, 0, 0, 0};
}
```

Keep the supplied `#pragma once` and `<stdint.h>` include. The example's 1500 us is an initial **detached bench center**, not a verified slack position. Each finger must get its own measured home and direction.

## 7. Upload and receive values with outputs OFF first

Check circuit continuity/polarity, leave actuator supplies off, keep tendons detached and use USB power for logic. From the **firmware** folder:

```powershell
pio run -e nodemcu_wifi_glove
pio run -e nodemcu_wifi_glove -t upload --upload-port COM7
pio device monitor --port COM7 --baud 115200 --eol LF --echo
```

Replace COM7 if your board has a different port. Use **115200 baud**, not the old sensor firmware's 230400. Close other programs owning that port before uploading. If `pio` is unavailable in a normal terminal, use the PlatformIO terminal/tasks in VS Code. No upload or physical actuation was performed while preparing this project.

The board prints **ESP_IP=... UDP=4212** and verification masks 0. If PCA=0, fix the PCA wiring/power/address before arming; reboot after fixing an I2C fault.

Keep the current WebXR server/tunnel running. Stop the old laptop **wifi-monitor / wifi-bench** sender. In a second terminal at this ZIP/repository root:

```powershell
python host/run.py wifi-glove --esp-ip 192.168.43.123 --key-file local-data/wifi-bench.key
```

**Replace 192.168.43.123 with the board's actual ESP_IP.** The laptop and ESP stay on the shared hotspot. The new command port is **4212**; old monitor 4210 and index bench 4211 are incompatible. This ZIP uses Python's standard library; no extra Python package is needed for this sender.

In Quest, use the existing scene. Expected laptop output:

```text
ESP FIVE ... VIB=[...] RES%=[...] HOLD=True M_ARM=0 S_ARM=0
PWM=[0,0,0,0,0] SERVO_US=[1500,1500,1500,1500,1500] S_SIGNAL=0
```

VIB/RES% are received requests. PWM/SERVO_US are controller commands, **not measured motor vibration, shaft position or tendon force**. The website's hardware readout remains observation-only; use these new local logs for actuator command receipts.

Terminal status now separates **ESP_LINK=LIVE** (a fresh authenticated ESP reply) from **QUEST=RIGHT_HAND_TRACKING / WAITING_FOR_VR / STALE_VR_DATA / NO_RIGHT_HAND_TRACKING** (current headset input). **LAST_REASON** is the firmware's saved state/disarm reason. For example `LAST_REASON=LINK_LOST` can remain after replies resume; it does not mean the current ESP Wi-Fi link is disconnected. With `QUEST=WAITING_FOR_VR`, enter VR on Quest and allow hand tracking; desktop rehearsal sends no cues.

## 8. Verify one finger at a time, then enable all five

**Quest not available?** Use [the standalone procedure](hardware-test-without-vr.md) and `host/run.py glove-test`. It sends controlled one-finger requests without a VR scene/server and keeps the same uploaded firmware. Startup is zero-only; local Serial ARM and verification masks still apply.

Do not set both masks to 31 just because the arrays arrive. The masks declare that the physical circuits are ready for a **detached, unloaded bench test**; that test is still required.

1. Obtain the diode and confirmed supplies. Check transistor B/C/E, motor polarity, common GND, stop loop and OE pull-up. Keep all threads detached. Check one motor driver and one servo at a time.
2. For the **index motor only**, set `motorVerifiedMask = 2`, `servoVerifiedMask = 0` in local GloveConfig.h. Rebuild/upload, restart the sender, then power the verified motor rail. With the VR hand open and clear of all objects, send **ARM MOTOR INDEX** with newline in Serial Monitor. Touch a virtual object using the index. Check motor current, starting, driver temperature and STOP behavior.
3. For the **index servo only**, set `motorVerifiedMask = 0`, `servoVerifiedMask = 2`; leave `pullDeltaUs` zero. Rebuild/upload and power that one servo's verified 5 V rail. With the real/VR hand open and clear, send **ARM SERVO INDEX**, then **JOG INDEX +10**. This requests home +10 us for 300 ms, returns home and disarms. Re-arm to try **JOG INDEX -10**. These are microseconds, not degrees. Confirm direction and home without a tendon attached.
4. Choose a slack mechanical arrangement around a measured home within **1400–1600 us**. After direction checks, start that finger's `pullDeltaUs` at **+20 or -20 us**, according to which direction takes up slack. Rebuild/upload; re-arm that servo; briefly grip a virtual object with the tendon still detached and confirm the pulse/shaft direction. Never copy one finger's direction blindly to another.
5. Repeat the named motor/servo tests for **THUMB, MIDDLE, RING, LITTLE** using bit values 1,4,8,16. Add completed bits to the masks. For example index + middle is **2 + 4 = 6**; all five is **31**. You can enable motors and servos independently.
6. Once every circuit, supply and per-servo setting passes, masks can be **31**. With the VR hand open and all cues zero, send **ARM BOTH ALL**. ALL selects only configured verified channels; it does not override their masks. Start with all tendons detached before a supervised mechanical trial.

Useful commands, uppercase and newline terminated:

```text
ARM MOTOR INDEX
ARM SERVO INDEX
ARM BOTH INDEX
ARM BOTH ALL
JOG INDEX +10
JOG INDEX -10
STOP
HOME
```

Any finger name can replace INDEX in ARM/JOG; JOG requires a single named servo. ARM replaces the previous selection. Neither Wi-Fi packets nor reconnects arm the board. A fresh link, closed D6 STOP loop, open VR hand and zero cues are required for arming. After a stop/expiry, clear the object/contact and explicitly re-arm.

## 9. How resistance is converted into a small servo movement

For finger `i`, the requested target is:

```cpp
targetUs = homeUs[i] + pullDeltaUs[i] * resistance[i] / 80;
```

The firmware ramps pull movement by at most 2 us per 20 ms step, with capped catch-up. Both home and endpoint must stay in **1400–1600 us**, and absolute pull delta must not exceed **100 us**. Invalid settings disable only that servo. A zero delta intentionally produces no pull. These limits bound commanded travel; they **do not bound tendon force** or prove wearer safety.

For example, a **bench-only illustration** with home 1500 and delta +20 gives 1500 us at RES=0 and 1510 us at RES=40. This is a position request, not 40% of measured physical force. MG90S and SG90 torque/mechanics differ; calibrate independently. PCA timing also depends on its oscillator, so check actual pulses if precision matters.

Release/tracking loss/stale source requests command motors to zero and servos home. Source data must be younger than 250 ms; ESP leases expire after 250 ms without a valid command. These are separate stages, not a guaranteed 250 ms end-to-end physical release time. There is a 60-second local arm expiry and a **3-second continuous pull limit on any finger**, which disarms the whole glove. STOP requests home for 300 ms before turning each servo signal off. An I2C fault disables OE immediately instead. None of these replaces a physical release.

## 10. Before attaching threads to fingers

A servo that pulls a dorsal thread can **actively extend a finger**. It is a crude position-based resistance demonstration, not a calibrated force controller or a guarantee that the real and virtual pose match. Keep broad soft attachments, initial slack, low travel and an elastic/breakaway element. Avoid a tight loop or rigid wire around a finger. Fit one finger under supervision only after an independent mechanical release works under load and when power is removed. Keep the power disconnect reachable; a stalled/geared servo may hold tension when PWM is off.

Check actual tension, travel, motor current, servo startup/loaded current, power loss, MCU reset, Wi-Fi loss, STOP and tracking loss before increasing channels. Keep glove wiring away from the Quest camera's joint view. The public scene is still accessible through the approved tunnel; authenticated LAN packets do not authenticate the browser producer. Initial actuator trials should be detached and supervised with one active Quest session.

To fall back, restore the matching firmware **and wiring**: old one-index `nodemcu_wifi_bench / wifi-bench` uses D5 for its motor and UDP 4211; this full glove uses PCA channel 9 S for index motor and UDP 4212. The receive-only `nodemcu_wifi_monitor / wifi-monitor` uses UDP 4210 and never drives actuators.
