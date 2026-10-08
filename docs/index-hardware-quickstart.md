# One index vibrator + one index servo from the existing Quest scene

The VR website stays unchanged. This new local companion selects the **second/index value** from each five-value array. The old `wifi-monitor` firmware is receive-only; actual output requires the new **nodemcu_wifi_bench** firmware and **wifi-bench** sender.

**Current status:** diode still missing; suitable motor power and separate servo power unresolved. Firmware/software are prepared; physical motion is untested. Keep all supplies disconnected while wiring, and the tendon detached throughout initial tests.

## 1. Power: VCC and V+ are different

| Connection | Supply | Purpose |
|---|---|---|
| NodeMCU USB | Laptop USB | NodeMCU logic and Wi-Fi |
| PCA9685 **VCC** | NodeMCU pin marked **3V** | PCA control chip and I2C logic |
| PCA9685 **V+** | Separate regulated **5 V** | Servo motor |
| Coin motor positive | Separate regulated **3 V**, or two AA alkaline cells in series | Reported 3 V DC coin motor |
| All **GND / negatives** | Connected together | Common signal reference |

The PCA board's maximum V+ rating is an upper limit, not the servo's minimum operating voltage. TowerPro specifies 4.8 V operation for MG90S/SG90. Supplying PCA VCC at 3 V does not make those servos work properly from 3 V. The NodeMCU's “3V” label identifies its nominal logic rail, not guaranteed spare actuator current. Reserve it for logic in this test. [PCA power guide](https://learn.adafruit.com/16-channel-pwm-servo-driver/hooking-it-up), [MG90S manufacturer](https://towerpro.com.tw/product/mg90s-3/), [SG90 manufacturer](https://towerpro.com.tw/product/sg90-7/)

Your existing **5 V / 2 A adapter can supply one unloaded servo**, through an insulated barrel/screw-terminal breakout with polarity checked. Alternatively use a separate USB power bank with a 5 V breakout. Keep servo current out of the NodeMCU and thin breadboard power paths. This is not a verified five-servo power budget. Do not put 5 V on NodeMCU 3V/GPIO, PCA VCC or the 3 V motor.

## 2. Wire the servo first

Use **one MG90S on PCA channel 1**, horn clear and thread detached. An SG90 can be substituted if its connector/supply are verified. Disconnect all power first.

| From | To |
|---|---|
| NodeMCU **3V** | PCA **VCC** |
| NodeMCU **GND** | PCA **GND** |
| NodeMCU **D2 / GPIO4** | PCA **SDA** |
| NodeMCU **D1 / GPIO5** | PCA **SCL** |
| NodeMCU **D7 / GPIO13** | PCA **OE** |
| Spare **1 kΩ** resistor | Between **OE** and NodeMCU **3V** |
| Separate **+5 V** | PCA screw-terminal **V+** |
| Separate 5 V negative | PCA screw-terminal **GND**, shared with NodeMCU GND |
| Servo brown/black | Channel **1 GND** row |
| Servo red | Channel **1 V+** row |
| Servo orange/yellow/white signal | Channel **1 PWM** row |
| NodeMCU **D6 / GPIO12** | Removable stop loop / normally closed switch to **GND** |

Read connector labels rather than guessing orientation. Do not join V+ and VCC. The firmware assumes PCA address **0x40**, address jumpers unset, and approximately 50 Hz PWM. Verify the breakout's I2C pull-ups reference VCC/3 V, not 5 V.

The 1 kΩ OE pull-up keeps PWM disabled during MCU reset; it is chosen to overcome a typical weaker breakout pull-down. Verify OE exceeds 0.7 × VCC (about 2.3 V at 3.3 V VCC) during reset; a board with a stronger pull-down or an OE-to-GND jumper needs correction. Opening D6-to-GND latches software disarmed. Also provide an accessible plug/switch to cut **servo V+**. **OE/PWM loss does not cut servo power or guarantee slack.** [PCA9685 datasheet](https://www.nxp.com/docs/en/data-sheet/PCA9685.pdf)

Power the NodeMCU first with V+ off. Measure VCC/OE and adapter polarity. An optional 100–470 µF capacitor across V+ and GND near the board can reduce dips; check polarity/voltage rating. It cannot replace an adequate supply.

## 3. Prepare the new project

Extract [AHAM-Index-Hardware.zip](../artifacts/AHAM-Index-Hardware.zip), keeping its folders together, or use the updated repository. Open **firmware** in VS Code/PlatformIO.

Copy `firmware/include/WifiSecrets.example.h` to **WifiSecrets.h**. Set the same hotspot name/password and laptop Wi-Fi IPv4 that worked previously. Keep the password local. The board is **ESP8266 NodeMCU**, not ESP32.

From the ZIP/repository **root**, run once:

```powershell
python tools/setup_wifi_bench.py
```

On this laptop, you can use `.\.venv\Scripts\python.exe` instead of `python`. Setup creates ignored local `firmware/include/BenchSecrets.h`, `local-data/wifi-bench.key`, and **BenchConfig.h**. Use the same folder for upload and sender so they share a pairing key. Re-running setup retains the pair. No actual key/password is included in the ZIP.

For the **servo-only detached test**, edit only local `firmware/include/BenchConfig.h` inside its existing namespace:

```cpp
constexpr bool motorVerified = false;
constexpr bool servoVerified = true;  // Only after wiring, 5 V power and OE checks.
constexpr uint8_t servoChannel = 1;
constexpr uint16_t homeUs = 1500;
constexpr int16_t pullDeltaUs = 0;     // No automatic tendon pull initially.
```

Leave both flags false if parts/power are unresolved or for a receipt-only first run. This mode requires no flex calibration or MPU6050.

## 4. Upload and start the sender

Stop the old **wifi-monitor sender** with Ctrl+C. Keep the existing **WebXR server and HTTPS tunnel** running. Close Serial Monitor and any USB bridge occupying the upload port. Do not run the older binary USB bridge with this text-output firmware.

From **firmware**, select **nodemcu_wifi_bench** and Upload:

```powershell
pio run -e nodemcu_wifi_bench -t upload --upload-port COM7
```

Replace COM7 if needed. Open Serial Monitor at **115200 baud**, **LF/newline** send ending:

```powershell
pio device monitor --port COM7 --baud 115200 --eol LF --echo
```

It boots **DISARMED** and prints `ESP_IP=... UDP=4211`. This firmware uses **4211**, not the old observation port 4210. Servo-only configuration should show `Verified outputs mask=2 PCA=1`; if PCA=0, check wiring/address and reboot after correction.

From another terminal at the ZIP/repository **root**, use your printed ESP IP:

```powershell
python host/run.py wifi-bench --esp-ip 192.168.43.42 --key-file local-data/wifi-bench.key
```

Example addresses are not your actual IPs. On this laptop use `.\.venv\Scripts\python.exe` in place of `python`. No additional Python package is needed for this companion. The Quest keeps the same page/game; the sender reads the existing laptop endpoint.

Pairing authenticates LAN command packets, not people accessing the temporary public scene. Keep this initial test **off the hand**, supervised, with no concurrent players. The existing server adds no public actuator endpoint.

## 5. Test one unloaded servo

1. Keep the horn clear and **thread detached**. Turn on separate 5 V servo power. Unarmed PWM should remain disabled.
2. In VR open the right hand away from objects; wait for fresh sender receipts with `VIB=0 RES%=0 HOLD=False`.
3. Close the D6 stop loop. In **ESP Serial Monitor** send **ARM SERVO** with newline. It commands 1500 µs, nominal centre. It may move substantially from its previous position, so keep the thread detached.
4. Send **JOG +10**: it requests 1510 µs for 300 ms, then home/disarms. Mark the horn to see the small movement. Re-arm and try **JOG -10** (1490 µs). Determine the winding direction. These are small unloaded tests, not a full-range sweep.
5. Re-arm and open D6-to-GND. Confirm home is requested, output disarms, and PWM is suppressed after a 300 ms parking interval. Closing D6 must not re-arm. Also test **STOP** in the monitor.
6. Re-arm with the hand open, then stop the laptop sender with Ctrl+C. Verify home/disarm on expiry. Restarting the sender must require another local arm command. Reboot must also start disarmed.

`SERVO_US` is the firmware's commanded pulse, not measured shaft position. A servo may retain its last position when PWM stops; if it jams, cut V+ and release the mechanism manually.

## 6. Use VR resistance for a small bench movement

Use a **soft elastic dummy load**, not a finger. After checking unloaded direction, set local **pullDeltaUs = +20** or **-20** in the direction that winds the thread; upload again. If too small to observe, enlarge only after detached measurement, up to the firmware's hard **100 µs** stroke limit and **1400–1600 µs** pulse envelope. Do not enlarge software limits to compensate for a poor mechanism.

```text
servo pulse = homeUs + pullDeltaUs × (index resistance percentage / 80)
```

Example: home 1500, delta +80, request 20% gives 1520 µs. The percentage is a demo intensity, not force/torque/tension. The small stroke may not be perceptible with slack thread; first confirm shaft motion and measure travel. Use a small horn radius, a compliant link and no tendon preload.

Open the hand, send **ARM SERVO**, then grab/lift a core. Expect nonzero index `RES%` and gradual small changes in `SERVO_US`. Releasing/opening requests home immediately. Continuous pull is capped at **three seconds**, then homes/disarms; local re-arming with an open hand is required. Arming expires after **60 seconds**.

The ESP command lease is **250 ms**. The sender also rejects cue/grip snapshots at 250 ms age including fetch delay. Source-age checking plus packet expiry can both contribute to stop delay; this is not a real-time force-control loop. Stops request home for 300 ms, then suppress PWM. I2C failure immediately suppresses PWM and may leave the shaft where it was.

## 7. Add one vibrator after obtaining the diode

Keep `motorVerified=false` and its supply disconnected until the circuit is complete. Use **2N2222A**, **330 Ω** base resistor, spare **10 kΩ** base/emitter resistor, and **1N4007** diode. Verify actual transistor **B/C/E** lead order from its manufacturer/package: the part name alone is insufficient. [ST datasheet](https://www.st.com/resource/en/datasheet/2n2222a.pdf), [onsemi datasheet](https://www.onsemi.com/download/data-sheet/pdf/p2n2222a-d.pdf)

| From | To |
|---|---|
| NodeMCU **D5 / GPIO14** | **330 Ω**, then transistor **base B** |
| Transistor **emitter E** | Common GND |
| Spare **10 kΩ** | Between **B** and **E/GND** |
| Motor negative | Transistor **collector C** |
| Separate **3 V positive** | Motor positive |
| Separate 3 V negative | Common GND |
| Diode **banded end / cathode** | Motor positive / +3 V |
| Diode **unbanded end / anode** | Motor negative / collector |

The diode goes **across** the motor, not in series. Do not reverse it. Use two AA alkaline cells in a holder or an appropriate regulated 3 V supply; no lithium cell directly, no 5 V and no GPIO power. Measure motor startup/running current and check transistor saturation/temperature before wearing it. The 330 Ω resistor does not guarantee adequate drive for an unidentified motor. This circuit assumes the reported two-wire **DC/ERM** device; an LRA needs another driver.

After circuit/supply/current checks, set local **motorVerified=true** and **servoVerified=false** for the separate first motor test; upload. Start sender, open hand away from contacts, send **ARM MOTOR**. Touch an object with the right index. Look for nonzero `PWM` and physically confirm vibration. Removing contact clears it. Low PWM may not start a DC motor: check driver/current/supply instead of increasing voltage or bypassing the circuit.

Repeat stop-loop, sender-stop and reset checks. Only after both separate tests pass, set both flags true, upload and use **ARM BOTH** with the hand open. Other four channels remain off regardless of VR values.

## 8. Mounting and expansion

Do not tie bare wire or a tight thread knot around a finger. A positional servo can forcefully extend a finger even with limited pulse travel. Before wearing, measure travel/tension on a dummy load; add a **wide soft attachment, elastic/breakaway link, slack at home, accessible mechanical release and servo-power cut**. Demonstrate release without a jam. A tendon may remain tight even after PWM/power stops. Do not use a rigid locked tendon to force the real hand into the rendered pose.

Future PCA allocation: thumb 0, **index 1**, middle 2, ring 3, little 4. Expansion requires five driver/diode circuits, individually measured servo home/direction/travel, a measured loaded-servo power budget, releases and fitted-glove Quest tracking. The current firmware intentionally drives only one index motor/PCA channel; all other PCA channels are disabled.

## Troubleshooting / rollback

- **NOT ARMED:** check verified flags, fresh receipt, zero contact/hold values, D6 grounded, PCA detected. It cannot arm while already holding a core.
- **NO FRESH BENCH RECEIPT:** check new firmware/port 4211, matching local pairing files, laptop IP, hotspot isolation and the existing relay. Old `OUTPUT=OFF` firmware does not acknowledge bench commands.
- **Servo jitter / NodeMCU resets:** cut actuator power; check separate 5 V supply, common ground and load. Do not power it from 3V/VCC.
- **Centres but does not respond to grab:** confirm nonzero `pullDeltaUs` and index `RES%`. Zero delta is the initial setting.
- **Reasons:** 0 boot, 1 ready, 2 manual stop, 3 stop open, 4 link lost, 5 arm expired, 6 pull expired, 7 I2C fault, 8 sender session changed. A packet never re-arms a stopped device.
- **Rollback:** remove actuator supplies, upload `nodemcu_wifi_monitor` and run its `wifi-monitor` sender, following [the receive-only guide](wifi-quickstart.md). Website/server/tunnel stay unchanged.
