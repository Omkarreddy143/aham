# Quest wireless + USB glove fallback

Use this when the phone hotspot delays laptop-to-ESP UDP packets. Quest still
runs the same HTTPS WebXR app; the laptop sends the five feedback channels to
the NodeMCU through its existing USB data cable.

```text
Quest hand tracking / contact / grasp
  → HTTPS WebXR relay on laptop
  → authenticated USB packets at 115200 baud
  → NodeMCU → PCA9685 → motor drivers and servos
```

The existing `nodemcu_wifi_glove` firmware now supports both USB and Wi-Fi.
The same packet authentication, boot/session checks, local ARM commands, D6
stop loop, fresh-source checks, 250 ms command lease, 60 second arm timeout and
3 second continuous servo-pull limit apply to both transports.

## Start the companion

1. Upload `nodemcu_wifi_glove` from this repository. Close Serial Monitor.
2. Keep the Quest relay running on port 8890 and open its current HTTPS address.
3. Connect NodeMCU by a USB data cable. Confirm the COM port.
4. From the repository root run:

   ```powershell
   .\.venv\Scripts\python.exe host\run.py wifi-glove --serial-port COM7 --control-file .build/glove-control.txt --key-file local-data/wifi-bench.key
   ```

Only one companion may run: stop the Wi-Fi sender before starting USB. Both
transports use the private pairing key created during the existing hardware
setup. Do not use the older binary Unity USB bridge with this firmware.

The application starts disarmed. Old lines in the control file are skipped on
startup; an earlier ARM is never replayed. Keep Serial Monitor closed while the
companion owns the port.

## Check and test the index channel

For connection checks without enabling outputs, double-click **Check Orbit
Foundry.cmd**. It verifies the current game URL, Quest uploads and new ESP
receipts, and requests only STATUS through this running companion. Use
`& '.\Check Orbit Foundry.cmd' --watch` for repeated checks. The report includes
PCA/D6 status and specific fixes; see the [connection-check guide](orbit-connection-check.md).

Keep the glove off your hand and all threads detached or slack for the initial
test. Confirm actuator power and common ground. D6 connects to GND through the
normally closed stop connection; PCA OE connects to D7.

With the USB companion running, append new local commands:

```powershell
Add-Content .build/glove-control.txt STATUS
Add-Content .build/glove-control.txt 'ARM BOTH INDEX'
Add-Content .build/glove-control.txt 'JOG INDEX +100'
Add-Content .build/glove-control.txt STOP
```

`STATUS` reports PCA detection, the stop loop, the last command age and transport.
ARM requires a fresh link, open hand, zero cues and locally enabled circuits.
INDEX selects servo channel 1 and motor-driver signal channel 9. The 3 second JOG
returns home and disarms automatically; `+10`, `+50`, `+100` and their negative
equivalents stay within the enforced 1400–1600 microsecond range. Pulse width is
not a force measurement. Choose direction and tendon travel through detached
bench checks before attaching a finger.

For a longer **detached bench observation**, use `JOG INDEX +100 10` to keep
the same position request active for ten seconds, then return home and disarm.
The optional duration accepts only `3`, `10` or `15` seconds; omitting it keeps
the three-second default. Link expiry, D6 and STOP still interrupt the jog.
This does not extend the continuous VR servo-pull limit.

To check a larger **detached** movement, use `ARM SERVO INDEX` followed by
`SWEEP INDEX`. The ten-second sequence uses 1500 → 1750 → 1250 → 1500 us with
the initial center configuration, then disarms. All threads must be detached;
only the selected servo may be armed, and the motor outputs stay off. Test
THUMB, INDEX, MIDDLE, RING and LITTLE separately. This is a bench command and
does not change the normal VR resistance range.

Re-arm the index pair with an open hand before a VR contact/grasp test. Touch an
object for vibration, then grasp, lift briefly and release for servo resistance
requests. Watch `VIB`, `RES%`, `PWM`, `SERVO_US`, `M_ARM`, `S_ARM`, and `S_SIGNAL`.
These values confirm requests and commanded output signals; a teammate must
confirm physical vibration and motion.

For this laptop's managed live companion, `Enable Index Feedback.cmd` and
`Stop Glove.cmd` use `tools/glove_command.py` and display the board's reply. These
shortcuts require the ignored local runtime metadata from the running companion.

USB bypasses the hotspot only for the laptop-to-ESP hop. The Quest HTTPS link
still needs working Internet. Stale Quest input produces zeros; USB does not
replay stale contact or grasp requests.
