# One index finger: start here

**Already uploaded the full sketch using VS Code / PlatformIO?** Skip the Arduino IDE setup and follow [the short post-upload steps](platformio-after-upload.md). The team currently uses that path. The motor's earlier 3 V report is now questioned as possibly 5 V; confirm its actual rating before applying the motor-power instructions below. Sensor/Unity steps use USB with the motor disconnected and are unaffected.

Goal: bending your real index finger bends the index finger in Unity. After that works, virtual contact can request one motor's vibration. Meta Quest 3, other fingers, GSR, MPU6050, PCA9685 and servos are later steps.

Your board is **ESP-12E NodeMCU V3 / ESP8266**. Use **USB power for the board and flex sensor**. No 5 V adapter is used in this walkthrough. The motor remains disconnected for steps 1–8; that portion does not need a transistor or motor power supply.

## 1. Put these parts on the table

- NodeMCU and a USB **data** cable.
- One flex sensor, breadboard and jumper wires.
- One **22 kOhm**, one **27 kOhm** and one **10 kOhm** resistor.
- Multimeter to check resistor values and A0 voltage.
- Laptop with Arduino IDE, Python and the AHAM Unity project.

Measure/identify resistor values before using them. Photos showed resistors, but their values were not readable enough to confirm. Disconnect USB whenever changing connections. You do not need an extra ADC for one flex sensor.

## 2. Wire the flex sensor

The flex sensor is a variable resistor; it needs a fixed-resistor divider. Because the exact NodeMCU V3 A0 input range has not been checked, use the following conservative wiring:

```text
NodeMCU 3V3 ---- flex sensor ---- X ---- 22 kOhm ---- GND
                                 |
                              27 kOhm
                                 |
NodeMCU A0 ---------------------- Y
                                 |
                              10 kOhm
                                 |
                                GND
```

X and Y are names for junctions on the breadboard, not board pins. Both ground connections go to NodeMCU GND. The flex sensor has no electrical polarity, but its mechanical bending direction matters; follow its supplier instructions.

| Part end | Connect to |
|---|---|
| Flex end 1 | NodeMCU 3V3 |
| Flex end 2 | Junction X |
| 22 kOhm resistor | X to GND |
| 27 kOhm resistor | X to junction Y |
| 10 kOhm resistor | Y to GND |
| A0 | Junction Y, after the voltage check below |

First leave the A0 wire unplugged. Power the NodeMCU by USB and measure Y relative to GND while gently bending the sensor. It must remain **below 1.0 V**. This network limits Y to about 0.892 V even when X reaches 3.3 V. Unplug USB, then connect Y to A0.

The team's received **33 kOhm** resistor can replace the 27 kOhm resistor between X and Y. Keep 22 kOhm from X to GND and 10 kOhm from Y to GND. The nominal maximum Y voltage then becomes about **0.767 V** with a 3.3 V supply; still verify wiring and measured voltage.

The ESP8266 chip has a 0–1 V ADC; some NodeMCU boards already attenuate A0. With an onboard divider this extra protection reduces the measured range. If motion is too small for calibration, identify the exact board schematic/A0 range and revise the network with measured voltages. Do not simply remove the protection. [ESP8266 ADC documentation](https://arduino-esp8266.readthedocs.io/en/latest/reference.html#analog-input)

## 3. Set up Arduino IDE once

1. Open Arduino IDE. In **File -> Preferences**, add this to **Additional Boards Manager URLs**:

   ```text
   https://arduino.esp8266.com/stable/package_esp8266com_index.json
   ```

2. Open **Boards Manager**, search **esp8266**, and install **esp8266 by ESP8266 Community**, version **3.1.2**.
3. Select **Tools -> Board -> ESP8266 Boards -> NodeMCU 1.0 (ESP-12E Module)**. The V3 label does not change this selection.
4. Connect NodeMCU by USB. In **Tools -> Port**, choose the port that appears when it is connected. `COM5` below is only an example.
5. Leave normal board defaults; if upload is unreliable, try upload speed 115200 and a confirmed data cable. A missing port may require the USB bridge chip's proper driver, identified from the actual board.

[Official board-installation instructions](https://arduino-esp8266.readthedocs.io/en/latest/installing.html)

## 4. Check that the real flex sensor works

Download and extract [AHAM-Index-Arduino.zip](../artifacts/AHAM-Index-Arduino.zip). Open **FlexCheck/FlexCheck.ino** in Arduino IDE. Upload it with the motor disconnected.

Open **Serial Monitor**, set **115200 baud**, and gently bend/straighten the sensor. You should see a changing number between 0 and 1023. Record straight and bent values. A constant 0, a constant 1023, or no useful change means check wiring, resistor values and the A0 range before continuing. Do not interpret a floating A0 as a working sensor.

This sketch is a sensor check only. It sends readable numbers and **does not connect to the existing Unity bridge**. Step 6 replaces it with the Unity-compatible firmware.

## 5. Fit the flex sensor to the glove

Place it along the **back of the index finger** so normal finger bending bends the sensor in its intended direction. Fix it gently in a fabric sleeve or with tape at suitable support points. Leave slack/strain relief at the electrical terminals. Do not fold it sharply, force the wrong bending direction, or glue its entire active length rigidly. Keep connections insulated from skin.

Repeat the Serial Monitor check while wearing the glove. Both comfortable straight and comfortable bent positions must produce repeatable readings.

## 6. Upload the complete ESP code

Close Serial Monitor. Open **AhamIndex/AhamIndex.ino** from the extracted Arduino ZIP. Keep these four files together in the **AhamIndex** folder:

```text
AhamIndex/
  AhamIndex.ino        <- complete board program: open this
  BoardConfig.h       <- pins and motor-enable setting
  ActuatorSupervisor.h
  AhamProtocol.h
```

These are the existing AHAM firmware and communication/supervision code, exported for Arduino IDE. No separate sensor library is needed. Upload using the same NodeMCU board and COM port. Keep **motorDriverVerified = false** in BoardConfig.h.

This firmware sends binary messages at **230400 baud**. Unreadable characters in Serial Monitor are expected, so close it and use the bridge instead. Keep D6 unconnected for this sensor-only motion check; calibration and motion display work while disarmed. You do not need to press Arm to see calibrated motion.

For maintainers: edit the original `firmware/src/main.cpp` and `firmware/include` files, then regenerate the Arduino export with `python tools/package_index_arduino.py`. Editing the exported BoardConfig.h is sufficient for an Arduino user's local motor-enable setting, but regeneration replaces that local change.

## 7. Start the USB bridge on the same laptop as Unity

Use the **complete AHAM repository/starter**, not just the Arduino ZIP. The Arduino ZIP provides board code and this guide; it does not contain the Python host or Unity project.

Stop any running AHAM simulator and close Arduino Serial Monitor. Otherwise the UDP port or serial port can be occupied. In PowerShell, open the repository folder:

```powershell
cd "C:\Users\komka\OneDrive\Desktop\Makethon"
.\.venv\Scripts\python.exe host/run.py bridge --port COM5
```

Replace COM5 with the **same actual port** chosen in Arduino IDE. This laptop already has the isolated Python environment. On another laptop without that environment, with Python installed, use:

```powershell
python -m pip install pyserial
python host/run.py bridge --port COM5
```

Keep the bridge terminal running. It should print **DISARMED; calibrate and arm explicitly**. That message means the connection started, not that calibration succeeded. The bridge runs at 230400 baud by default. The browser dashboard is not required for the real board.

## 8. See your index finger move in Unity

1. In Unity Hub, **Add project from disk**, and select **C:\Users\komka\OneDrive\Desktop\Makethon\unity**. Select the unity folder, not Assets or the whole repository. Open with the installed Unity 6000.6.4f1.
2. Open **Assets -> AHAM -> Scenes -> AhamStarter** and press **Play**.
3. Turn **Software preview** off. The status should say **USB glove via local bridge**. Raw flex should look like `0, changing number, 0, 0, 0`.
4. Tick **Enable outgoing commands after checking the connection**. This allows the calibration buttons to send commands.
5. Hold your index finger comfortably straight and click **Capture open**.
6. Bend it comfortably and click **Capture closed**. **Calibrated: True** should appear. If False, check repeatable sensor movement/range; the minimum span is about 30 original ADC counts, or 120 scaled protocol counts.
7. Straighten, half-bend and bend again. The virtual index finger should follow. Other four fingers stay straight because their sensors are not connected.
8. Leave the state **Disarmed**. Expected masks: **flex 2 / motor 0**. This is the first working hardware milestone.

The displayed raw number is scaled from 0–1023 to 0–4095. Finger motion uses the calibrated normalized curl, rather than assuming a generic flex sensor resistance.

## 9. Add vibration after the sensor-to-Unity loop works

This is a **separate electrical stage**. USB continues to power NodeMCU. The motor needs its own suitable **3 V supply** and a verified switching circuit. The 5 V adapter remains unused. An organizer's regulated 3 V bench supply is suitable if it supports verified startup current. A two-AA alkaline holder is an alternative only if the motor's specified voltage range includes the actual fresh-battery voltage; batteries are not an exact regulated 3 V source.

Do not use D5 as motor power. Using the board's 3V3 power output would require checking the motor's allowed voltage and the actual board regulator's spare/startup capacity. Those checks have not been done, so this guide does not assume that power path works.

First confirm the motor is a brushed **DC/ERM** unit, its running/startup current, and the exact **2N2222A B/C/E pin order**. A 10 mm / 3 V description alone does not confirm these. LRAs need a different drive circuit. [Manufacturer comparison](https://www.precisionmicrodrives.com/ab-028)

For a verified DC motor, collect **1N5819 flyback diode**, **10 kOhm base pulldown**, and a properly sized **series base resistor**. 470 Ohm is a candidate, not yet a confirmed final value; see [base-drive checks](index-finger-mvp.md#npn-alternative-with-the-available-parts).

| Connection | Destination |
|---|---|
| D5 | Series base resistor -> transistor base B |
| Base B | 10 kOhm -> emitter E |
| Emitter E | NodeMCU GND and motor-supply negative |
| Collector C | Motor negative |
| Motor positive | Suitable 3 V motor-supply positive |
| Diode band/cathode | Motor positive |
| Diode other end/anode | Collector / motor negative |
| D6 | Normally closed stop switch -> GND |

**B/C/E are terminal names, not a left-to-right lead order.** Confirm physical pinout before inserting the transistor. Wire with power disconnected, and test motor current, transistor voltage drop/temperature and supply stability off-hand with an organizer's current-limited source. Do not lower the base resistor blindly if startup fails; adequate switching may need another driver stage.

## 10. Enable one contact cue and check stopping

Only after the driver, supply, stop switch and off-hand circuit have been verified:

1. Disconnect motor power. In the sketch's **BoardConfig.h** tab change `motorDriverVerified = false` to `true`, then upload. Keep all servo connections absent.
2. Close Serial Monitor, restart the USB bridge, and press Play in Unity. Expected masks are **flex 2 / motor 2**.
3. Enable outgoing commands. Capture open/closed again if necessary. The stop switch must connect D6 to GND in its normal position.
4. Connect motor supply with the motor still **off-hand**. Click **Arm** only after checking live telemetry and the stop loop.
5. Use the **Desktop hand depth** slider and index bending to put the virtual index fingertip into a coloured block. Vibration is a contact cue; there is no pressure or resistance mechanism.
   Unity's **Index contact** indicator shows the selected block even when motor output is disabled. Use it to verify contact first; the indicator alone does not mean a motor command is being applied.
6. Move away: the cue request should clear. Open the stop switch: output must stop and Fault appear. Close the switch, click **Clear fault**, then explicitly **Arm** again.
7. Stop the bridge or remove USB: motor output must stop. Restoring the connection must not automatically arm it. Test this with motor power still present off-hand.
8. Check repeated contacts/releases. Continuous cues are capped at two seconds, accepted commands have leases of at most 100 ms, and missing refresh latches a timeout at 150 ms. After these checks pass, mount the motor with comfortable insulation and strain relief.

## If something does not work

| Symptom | First check |
|---|---|
| No COM port | Data cable, USB connection, actual USB-chip driver |
| Upload says port busy | Close Serial Monitor and stop the Python bridge |
| Flex value constant | Divider junctions/resistor values, supply/ground, sensor connection |
| Unity says absent/stale | Binary AhamIndex firmware uploaded, correct COM port, bridge running, simulator stopped |
| Calibrated remains False | Repeatable open/bent readings with enough span, no rail readings |
| Motor mask stays 0 | Driver-enable setting remains false; this is expected during sensor checks |
| Arm fails or Fault 1 | D6 stop loop open; sensor-only motion does not need arming |
| Fault 2 | Command refresh lost: outgoing commands, bridge and Unity still running? |

Board-code compilation and desktop software checks can be verified without wiring. Actual upload, voltage, finger tracking, motor behavior and Unity contact physics still need physical verification by the team.
