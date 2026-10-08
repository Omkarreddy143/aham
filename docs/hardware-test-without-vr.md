# Test the glove without VR

The already uploaded **nodemcu_wifi_glove** firmware works with this standalone laptop tester. Keep the laptop and ESP on the same 2.4 GHz hotspot. Quest, Unity, the VR website, the local web server and the tunnel can all stay closed. No website changes are required.

The tester sends explicitly labelled bench requests directly to the ESP. It never claims they came from Quest, never sends ARM over USB, and never changes verification masks. Startup and inspection mode send zeros only.

## 1. Power the control chip first

With actuator supplies disconnected and every finger thread detached, connect:

| NodeMCU | PCA9685 |
|---|---|
| 3V | **VCC**, the control-chip power input |
| GND | GND |
| D2 | SDA |
| D1 | SCL |
| D7 | OE, with the documented 1 kohm pull-up to 3V |

Use the existing D6 normally closed STOP loop to GND. An open loop prevents arming. Follow the full circuit guide for its physical stop arrangement.

Power NodeMCU by USB. This also powers PCA **VCC** through the 3V wire. The servo **V+** terminal can remain unpowered for this detection check. Missing V+ alone should not stop I2C detection. Do not supply servo/motor power from NodeMCU's 3V pin.

Open Serial Monitor on the actual board port (last detected **COM7**), at **115200 baud**, with newline line endings. Press **RST** after VCC is connected. Look for:

```text
Verified motor mask=0 servo mask=0 PCA=1
ESP_IP=YOUR_ESP_IP UDP=4212
```

`PCA=0` means the control chip was not detected/configured: check VCC, common GND, SDA/SCL and address (this firmware expects 0x40). The firmware latches an I2C fault, so reset after fixing power/wiring. Servo V+ does not replace VCC. [PCA9685 power connections](https://learn.adafruit.com/16-channel-pwm-servo-driver/hooking-it-up)

## 2. Check communication with everything OFF

In a terminal at the repository/extracted ZIP root:

```powershell
python host/run.py glove-test --esp-ip YOUR_ESP_IP --key-file local-data/wifi-bench.key --seconds 5
```

Replace `YOUR_ESP_IP` with the address printed by the board. In this laptop's repository virtual environment, use `.venv\Scripts\python.exe` instead of `python` if needed.

This command exits after five seconds and sends only zeros. Expected receipts have `M_ARM=0`, `S_ARM=0`, `PWM=[0,0,0,0,0]`, and `S_SIGNAL=0`. A printed SERVO_US of 1500 with S_SIGNAL=0 is a stored home value, not an active servo pulse or measured position. The tester's receipt describes commands; it does not measure actual motion, vibration or force.

Stop any other `wifi-glove` / `wifi-bench` / `wifi-monitor` sender before an actuator test. The standalone tester must be the sole command sender; competing sessions can cause refusals/disarming.

## 3. Test just the index motor

Complete the circuit and confirm the external **3 V** motor supply, the 2N2222A B/C/E connections, base/pull-down resistors and flyback diode. Keep tendons detached and servo power off. The index motor driver signal comes from PCA **channel 9 PWM/S**, not its V+ pin.

Only after those checks, set local **firmware/include/GloveConfig.h** to:

```cpp
constexpr uint8_t motorVerifiedMask = 2;
constexpr uint8_t servoVerifiedMask = 0;
```

Keep all other definitions. Close Serial Monitor, rebuild/upload **nodemcu_wifi_glove**, and reopen at 115200 with newline. Connect the verified motor supply and shared ground. This starts DISARMED.

Start the interactive tester in a separate terminal:

```powershell
python host/run.py glove-test --esp-ip YOUR_ESP_IP --key-file local-data/wifi-bench.key
```

Wait for ESP receipts. In **Serial Monitor**, send:

```text
ARM MOTOR INDEX
```

When `M_ARM=2 S_ARM=0 READY` appears, type in the **tester terminal**:

```text
motor INDEX
```

It requests duty **95/255** on the index channel for **3 seconds**, then returns to zeros. Actual delivery depends on the network and firmware lease; this is not a guaranteed exact physical pulse duration. The controller's 50 Hz PWM can make the vibration pulsed. Check current, starting and transistor heating before repeating. A motor not starting does not justify removing its diode/base resistor or increasing its voltage. The tester refuses a new pulse during an active test or the following one-second pause.

In Serial Monitor, send `STOP` to disarm. Confirm the motor stops. Use the physical power disconnect if required.

## 4. Test just the index servo, without any thread attached

Disconnect the motor supply. Confirm a separate suitable regulated **5 V** servo supply to PCA **V+**, its negative to common GND, and index servo on **channel 1**. VCC stays on NodeMCU 3V. Start with only this servo powered; the 5 V/2 A adapter is not yet verified for five servos together.

In local GloveConfig.h use:

```cpp
constexpr uint8_t motorVerifiedMask = 0;
constexpr uint8_t servoVerifiedMask = 2;
```

Keep `pullDeltaUs` zero initially. Close both sender and Serial Monitor before upload; rebuild/upload, reconnect the interactive tester, and reopen Serial Monitor. After powering the one servo and checking PCA=1, send these commands **in Serial Monitor**:

```text
ARM SERVO INDEX
JOG INDEX +10
```

Arming initially commands its detached home (example 1500 us). JOG requests home +10 us for 3 seconds, returns home, then disarms. Re-arm before trying `JOG INDEX -10`. These are **microseconds, not degrees**; motion may be very small. Keep the tester running to provide zero-request heartbeats; JOG does not need VR.

After verifying unloaded direction and a measured slack home, configure a small per-index pull delta (+20 or -20 us according to direction), rebuild/upload and re-arm only that servo. Then type **in the tester terminal**:

```text
grip INDEX
```

This requests RES=20/80 for 2 seconds, then zero/home. With delta +/-20 us the target differs from home by only +/-5 us; zero delta produces no pull. This verifies mapping/direction, not calibrated resistance or wearer safety. It is intentionally a small detached test.

## 5. Remaining fingers and stopping

Repeat separately using **THUMB, MIDDLE, RING, LITTLE**. Set the one selected mask bit (1,4,8,16 respectively) after its circuit checks; do not select all five for initial tests. Motor channels are 8,10,11,12 and servo channels 0,2,3,4 respectively.

Tester commands:

```text
motor INDEX
grip INDEX
zero
status
quit
```

`zero` (or `stop` in the tester terminal) requests zero motor duty and servo home; it **does not disarm**. `STOP` in **Serial Monitor** disarms. Closing the tester sends best-effort zeros; loss of its 250 ms firmware lease also disarms. PCA OE/PWM off does not disconnect actuator power or guarantee a tendon becomes slack. Complete an independent mechanical release and supervised low-load checks before attaching any thread to a finger.

This procedure needs no VR scene and leaves the VR software unchanged. Restore the normal `wifi-glove` sender when you return to Quest.
