# PlatformIO: after uploading to the index-finger board

Use the received **ESP8266 NodeMCU V3**. The team confirms the **full Unity-compatible AhamIndex.ino from the ZIP** is uploaded using PlatformIO. That sketch and the repository's `firmware/src/main.cpp` use the same AHAM protocol, so **do not upload another program just to connect Unity**. A flex-number-only sketch or `nodemcu_probe` diagnostic would need replacing before using this bridge. Keep motor power disconnected initially.

## 1. Confirm which program is on the board

For the full uploaded ZIP sketch, keep the **BoardConfig.h used by that sketch** set to **motorDriverVerified = false** while checking finger movement. Arduino export and repository headers are separate copies: edit the one in the project you actually upload.

If using the original repository project in VS Code, its PlatformIO project is the **firmware** folder. Its `platformio.ini` has environment **nodemcuv2**, board **nodemcuv2**, and uses `src/main.cpp`; its header is **firmware/include/BoardConfig.h**.

The uploaded full sketch is already compatible: continue to step 2. If replacing a different program using the repository project, select **Project Tasks -> nodemcuv2 -> General -> Upload**. Or from the repository root on this laptop:

```powershell
.\.venv\Scripts\python.exe -m platformio run --project-dir firmware -e nodemcuv2 --target upload --upload-port COM7
```

COM7 was detected on this laptop on 7 October 2026; confirm it still belongs to your NodeMCU. Upload replaces the current program. Do not select esp32dev for this ESP8266 board.

## 2. Check the flex wiring

USB powers the NodeMCU and sensor. Unplug USB before wiring. Use verified resistor values:

```text
3V3 -- flex sensor -- X -- 22 kOhm -- GND
                     |
                  27 kOhm
                     |
A0 ----------------- Y
                     |
                  10 kOhm
                     |
                    GND
```

First leave A0 disconnected and measure Y relative to GND while bending the sensor: it must stay below 1 V. Unplug USB, then connect A0 to Y. This conservative network accounts for an unverified A0 range; an onboard attenuator may reduce its useful span. Follow the [detailed sensor setup](index-finger-step-by-step.md#2-wire-the-flex-sensor) if readings/calibration are too small.

Fit the sensor along the back of the index finger, bending in its intended direction without sharp folds or tension at the terminals. Other modules are not needed. Leave D6 open for the initial disarmed motion check; pressing Arm is unnecessary.

## 3. Free the communication ports

Close **PlatformIO Serial Monitor**. Stop any AHAM simulator. A serial monitor and bridge cannot both use the same COM port; the simulator and real bridge also compete for the localhost command port.

The full AHAM firmware sends **binary data at 230400 baud**. Unreadable monitor characters do not by themselves mean the upload failed. A program that prints readable numbers is a different sensor-check program and does not speak the Unity protocol.

## 4. Start the USB bridge

In a separate VS Code PowerShell terminal:

```powershell
cd "C:\Users\komka\OneDrive\Desktop\Makethon"
.\.venv\Scripts\python.exe host/run.py bridge --port COM7
```

Keep this terminal running. It should report **DISARMED; calibrate and arm explicitly**. That startup message does not prove valid telemetry yet. If the port is busy, close Serial Monitor; if the UDP address is occupied, stop the other simulator/bridge instance.

## 5. Open Unity and calibrate

1. Open the repository's **unity** project and **Assets -> AHAM -> Scenes -> AhamStarter**.
2. Press **Play**. Status must become **USB glove via local bridge**, rather than SIMULATED GLOVE or absent/stale.
3. Bend the index sensor: **Raw flex** should show `0, changing value, 0, 0, 0`.
4. Tick **Enable outgoing commands after checking the connection**.
5. Hold the index finger comfortably straight -> **Capture open**.
6. Bend it comfortably -> **Capture closed**.
7. Check **Calibrated: True**. Straighten/half-bend/bend: the virtual index finger should follow.

Expected masks: **flex 2 / motor 0**. Stay **Disarmed** for this check. About 30 original ADC counts of repeatable open/bent span are needed; the displayed raw value is scaled to 0–4095. If calibration fails, check measured wiring and board A0 range rather than forcing the sensor further.

## 6. Adapt the linked motor tutorial

The supplied [YouTube video](https://www.youtube.com/watch?v=ZAsGHhWxwpM) has [written instructions by its creator, Science Buddies](https://www.sciencebuddies.org/science-fair-projects/project-ideas/VirtualReality_p007/virtual-reality/arduino-VR-haptic-glove). Those instructions use an Arduino, **5 V motors**, **N-channel MOSFETs**, and the board's **5 V power rail**. They do not power the motors from the control GPIOs. Their ultrasonic-sensor code also differs from AHAM's Unity contact commands.

The team previously reported a **3 V motor**, and later questioned whether it might be 5 V. Its rating now needs confirmation from the original supplier/product label; do not infer it from this video or the NodeMCU USB input. USB supplies 5 V to the board, while the ESP8266 uses 3.3 V logic. Keep the motor unplugged during the Unity motion steps.

For the **2N2222A** version, verify DC motor type, rated voltage, startup current and transistor pinout before enabling output. Use a motor supply matching the verified rating with common ground; no 5 V adapter is required. The board's power rail is an alternative only after checking its voltage and spare/startup capacity against the motor specification.

| Connection | Destination |
|---|---|
| D5 / GPIO14 | Correctly sized series base resistor -> base B |
| Base B | 10 kOhm -> emitter E |
| Emitter E | NodeMCU GND and motor-supply negative |
| Collector C | Motor negative |
| Motor positive | Motor-supply positive matching the verified motor rating |
| 1N5819 diode band / other end | Motor positive / motor negative |
| D6 / GPIO12 | Normally closed stop switch -> GND |

470 Ohm is a candidate base resistor, not a verified final selection without motor current. Do not use the video MOSFET's gate wiring/resistor as an NPN base circuit, or assume universal left-to-right transistor pins. See [the NPN sizing and pinout checks](index-finger-mvp.md#npn-alternative-with-the-available-parts).

After the off-hand motor circuit and stop behavior are verified, disconnect motor power, set `motorDriverVerified = true` in **the BoardConfig.h used by your uploaded PlatformIO project**, and upload again using that same project. For the repository project this is **firmware/include/BoardConfig.h**, environment **nodemcuv2**. Close the monitor, restart the bridge, then Play in Unity. Expected masks: **2 / 2**. Connect the verified motor supply with the motor off-hand, check the stop loop, and explicitly **Arm**. Bend/move the virtual fingertip into a coloured block using **Desktop hand depth**. Leaving contact, opening the stop switch, or loss of commands must stop output. Clear faults and arm explicitly after restoration. Mount the motor only after those checks pass.
