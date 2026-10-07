# Show Unity vibration values with the motor disconnected

This demonstrates **real flex input -> Unity virtual contact -> calculated vibration cue -> bridge receipt**, while motor output remains disabled. It does not demonstrate physical vibration or MCU acceptance of a motor command.

1. Keep the motor disconnected. Keep `motorDriverVerified = false`; do not upload a motor-enabled configuration or press Arm.
2. Run only one bridge, with the new monitor option:

   ```powershell
   .\.venv\Scripts\python.exe host/run.py bridge --port COM7 --stats --cue-monitor
   ```

   If the assistant already started it on this laptop, leave it running; its log is `.build/judge-cue.log`. No new firmware upload is required.

3. In Unity, stop Play, wait for compilation, and press Play again. Turn **Software preview off** and leave **Use MPU6050 off**. Keep **Monitor Unity cues (no motor output)** checked. Leave outgoing actuator commands unchecked; monitor packets do not require that checkbox or arming.
4. Bend the real index finger and adjust **Desktop hand depth** until **Index contact** shows a block name.
5. Compare these three lines:

   | Unity display | Meaning |
   |---|---|
   | Unity index cue | Calculated intensity/pattern before motor capability gating |
   | Bridge received cue | Intensity echoed by the monitor receiver; waiting/stale after 0.5 s without an echo |
   | Board applied index PWM | Actual applied value reported by firmware; stays zero with motor output disabled |

   Expected cue presets: Smooth **100/255**, pattern **1**; Rough **150/255**, pattern **2**; Soft **80/255**, pattern **3**. The primitive index may overlap adjacent blocks; the highest-priority contact wins. These are chosen cue settings, not measured contact force or physical material reconstruction. Before and after contact the requested value is **0**. A short release hold can last up to 50 ms.

The monitor uses a separate localhost port **8767**, validates normal AHAM haptic packet framing/payload, and echoes only to Unity on **8765**. These monitor packets are **never forwarded to USB**. The usual actuator commands remain on **8766** and keep their existing arming/capability/lease requirements. Firmware motor mask remains zero.

For judges: “We have verified live finger sensing and can demonstrate the software's return cue reaching our local bridge. Physical motor feedback is pending the completed driver circuit.”
