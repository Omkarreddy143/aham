# Check Orbit Foundry without an assistant

Double-click **Check Orbit Foundry.cmd** in the Makethon folder. It prints a
verified current Quest game link, checks each connection and lists the next
steps for anything missing. The window stays open so you can read or copy it.

From VS Code's PowerShell terminal, opened in the Makethon folder:

```powershell
& '.\Check Orbit Foundry.cmd'
```

For repeated checks while a teammate plays:

```powershell
& '.\Check Orbit Foundry.cmd' --watch
```

Watch mode refreshes the local Quest input and ESP receipts about once a second.
The **LIVE WATCH** counter and **ESP RECEIPT: sequence / age** show whether
the display and board replies are advancing, even when all values stay zero.
Slow public-link and process checks run in the background every 15 seconds;
their verification age is displayed. Old ESP receipts never count as live.
The terminal refreshes in place with the values and data-path status first.
It shows the first recovery step; the saved report contains every recovery step.

After updating the checker, press **Ctrl+C** in an existing watch window and
run the command above again to load the new code.
Press **Ctrl+C** to stop. The latest report is saved as **ORBIT-STATUS.txt** in
the same folder; it is local and excluded from Git. For a single check without
the shortcut's final pause:

```powershell
.\.venv\Scripts\python.exe tools\orbit_status.py
```

This checks connections and requests only **STATUS** through the existing USB
companion. It does not open/reset the serial port, arm or disarm outputs, run
motors, upload firmware, restart services or change Wi-Fi. Existing arming is
left unchanged. Do not use the report as confirmation of physical movement.

## Read the result

| Report | What it means / what to do |
|---|---|
| **WORKING QUEST LINK** | Both the public relay and actual Orbit game page responded. Open this exact `/game.html` URL on Quest. An old browser tab is not the source of the current address. |
| **Link not verified** | Keep laptop Internet connected; run **Open VR Link.cmd**. If recovery fails, run **Refresh VR Link.cmd**, then open the new URL on Quest. |
| **QUEST → LAPTOP: LIVE** | Fresh right-hand tracking data reached the relay. Zero cues are normal while the hand is away from objects. |
| **WAITING** | Quest is absent or uploads stopped. Open the working link, select Right hand and Enter VR. If already there, exit VR, reload and re-enter. Locally moving hands alone do not prove uploads are working. |
| **CONNECTED, but right-hand tracking is missing** | Put controllers aside and keep the right hand visible to the headset cameras. |
| **DESKTOP PREVIEW ONLY** | The relay received synthetic data, not a live Quest hand. Enter VR on Quest. |
| **UPLOAD REJECTED** | The headset reached the relay but its request was refused. Reload the exact current tunnel URL rather than an old/static page. |
| **ESP REPLIES: LIVE** | A new authenticated board receipt was logged during this check. Historical lines are ignored. |
| **NO FRESH REPLY** | Check USB/board power, the COM port and the companion terminal. In Wi-Fi mode, check the saved ESP network/IP. If a companion is already running, do not launch a duplicate. |
| **PCA9685 / D6** | A fresh USB board STATUS confirms PCA detection and whether the stop loop is closed. Check D1 → SCL, D2 → SDA, common ground, and D6's stop connection if reported missing/open. Without a fresh STATUS these remain unconfirmed. |
| **OUTPUTS: DISARMED** | Receipt works independently of arming. The checker never enables hardware. Use the existing index-test procedure only after its power and slack-thread checks; **Stop Glove.cmd** stops/disarms outputs. |

The array order is **thumb, index, middle, ring, little**. `VIB`, `RES%` and
`HOLD` show requests received by ESP. `PWM`, `SERVO_US` and `S_SIGNAL` show
commanded outputs, not measured vibration, tension or motion. `M_ARM`/`S_ARM`
masks use thumb=1, index=2, middle=4, ring=8, little=16; 0 means none, 31 all five.
The board's last stop reason can be historical even when fresh replies arrive.

`AUTOMATIC FEEDBACK` reports OFF, WAITING_DATA, WAITING_NEUTRAL, ARMING,
ACTIVE or BLOCKED. When waiting, keep the right hand clear of objects for two
seconds. See [automatic feedback](automatic-feedback.md). **Stop Glove.cmd**
cancels automatic mode; the checker itself never enables it.

**DATA PATH: READY** means the game link, Quest input and ESP replies are
working together. PCA/stop/arming are reported separately. The Python command
returns exit code 0 for a ready data path and 1 while a connection is missing;
waiting for a disconnected headset is an expected incomplete result.

## Which network?

The checker reads the selected transport from this laptop's saved runtime:

- **USB COM7:** Quest and laptop need Internet for the HTTPS tunnel. They may
  use different networks. ESP feedback uses its USB cable, so it does not need
  the phone hotspot for that hop. Keep Serial Monitor closed.
- **Wi-Fi:** laptop and ESP must share the configured 2.4 GHz hotspot or a
  reachable LAN. Quest can use any Internet connection.

The fixed GitHub/Githack build and Witness Garden cannot send live glove cues
to the laptop. Use the verified tunnel `/game.html` link for this test.

If the companion is not running, follow [USB setup](usb-glove-quickstart.md) or
[five-finger Wi-Fi setup](five-finger-hardware.md). Start exactly one sender.
The checker depends on the ignored `.build/quest-wireless.json` settings and
the managed companion's live log. A fresh download needs setup first; run
**Open VR Link.cmd** and configure the companion using those guides.
