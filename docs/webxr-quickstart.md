# Quest 3 WebXR quickstart

**Final demo:** the home page now offers two experiences. Choose **Witness Garden** for the three-minute Tattva presentation, then **Enter VR · begin journey**. It uses both tracked hands, local light/chime interactions and original ambient music; no glove connection is required. Read [the three-minute judging script](final-demo-3min.md). Choose **Orbit Foundry** to retain the original grasp/lift game and feedback-request path. A laptop desktop rehearsal uses simulated hands and does not mirror the headset.

The selected approach uses **Quest Browser over a wireless connection**. Unity is not required. **Orbit Foundry v4** tracks both hands and adds right-hand grabbing, lifting and delivery gameplay with a compact scoreboard and clear grab/lift/drop cues. The team has confirmed changing five-channel requests reach the ESP over Wi-Fi. This prototype is **monitor only**: physical motor and servo output remain disabled.

```text
Quest Browser: hand joints -> virtual contact -> calculated cues
  -> same-origin HTTP request -> laptop relay -> localhost UDP 8767 monitor
  <- monitor echo / optional USB board telemetry on localhost UDP 8877
```

Meta supports WebXR hand tracking with 25 joints per hand, including position and orientation. These are estimated poses, not flex-sensor or IMU measurements. [Meta WebXR Hands](https://developers.meta.com/vr/documentation/web/webxr-hands/)

## Start the wireless demo

On this Windows laptop, double-click **Open VR Link.cmd** in the Makethon folder. It checks the existing URL and reuses it when healthy. If it is unavailable, it creates a new tunnel, updates the relay's exact HTTPS origin, verifies the public relay, copies the URL to the clipboard, opens the browser and saves **VR-LINK.txt**. Double-click **Refresh VR Link.cmd** to force a new URL immediately. Wait for **READY** before sharing it; Internet/DNS registration can take several seconds. Close old AHAM tabs on Quest, open the new URL and Enter VR again.

This laptop also has **AHAM Refresh VR** on the desktop with **Ctrl+Alt+V** assigned. It opens the same refresh command in a visible window. Fresh downloads can use the two `.cmd` files directly; the desktop shortcut is a local convenience and is not inside the ZIP.

These shortcuts manage only the tunnel and VR relay. They preserve ESP addresses, pairing files, hotspot credentials and hardware settings. Use the other Wi-Fi for VR-only testing; before the combined ESP test, reconnect the laptop to the ESP's configured phone hotspot and restart the Wi-Fi sender after a network switch. Changing laptop networks can also interrupt the tunnel.

The Windows relay requests temporary sleep prevention while running and clears that request when it stops. This does not change saved Windows power settings or prevent Internet outages. Quick Tunnels have no guaranteed lifetime or uptime; a stable hostname requires an account/domain with a managed tunnel. [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/), [managed tunnel setup](https://developers.cloudflare.com/tunnel/get-started/)

Manual equivalent:

```powershell
.\.venv\Scripts\python.exe tools/vr_link.py --force
```

Check without restarting anything:

```powershell
.\.venv\Scripts\python.exe tools/vr_link.py --status
```

The selected route is a **Cloudflare Quick Tunnel**. It gives the laptop service a temporary HTTPS address that Quest Browser can open wirelessly. No Cloudflare account or domain is needed. Anyone with the URL can access it while the tunnel runs; stopping the tunnel closes that URL. [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)

Open PowerShell in the Makethon folder. If the tunnel, relay, or bridge is already running, reuse it rather than starting duplicates.

For a fresh download only, install Python if needed, then prepare its environment:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r host/requirements.txt
```

This laptop has the official tunnel client at `.build\cloudflared.exe`. If that file is missing in a fresh download, get the Windows client from [Cloudflare's downloads page](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/), create `.build`, and save the client as `cloudflared.exe` there.

**Terminal 1 — tunnel:**

```powershell
.\.build\cloudflared.exe tunnel --url http://127.0.0.1:8890 --protocol http2 --edge-ip-version 4 --no-autoupdate
```

Copy the printed `https://…trycloudflare.com` address exactly, **without a trailing slash**. Keep this terminal running. It may report that the local server is unavailable until Terminal 2 starts.

**Terminal 2 — scene and relay:** replace `https://COPIED-HOST` with that copied address.

```powershell
.\.venv\Scripts\python.exe host/run.py webxr --external-origin https://COPIED-HOST
```

**Terminal 3 — optional USB board telemetry and monitor echo:** verify the board is still on COM7 first.

```powershell
.\.venv\Scripts\python.exe host/run.py bridge --port COM7 --stats --cue-monitor --telemetry-port 8877
```

Only one process may own COM7. Stop an old bridge or Serial Monitor before opening a new one. This companion echoes monitor cues back to the relay; it never forwards those cues to USB. Keep the motor disconnected and do not arm the board.

Open the copied **HTTPS address in Quest Browser**, press **Enter VR**, allow hand tracking, and put down the controllers. Both hands render; entering the game selects right-hand feedback. Both the laptop and headset need Internet access. If you restart the tunnel, copy its new address and restart the relay with that address.

After updating, **exit VR, reload the page, check for ORBIT FOUNDRY v4, then Enter VR again**. The current laptop preview submits no cues. Close any older v1/v2 preview tabs that may still submit zeros. Expand **Tracking & connection details** on the laptop for joint counts and five independent finger curls/cues. Hidden hands or missing finger poses remain unavailable rather than moving synthetically.

Feedback HTTP requests allow up to three seconds for a tunnel round trip. This is a request timeout, **not** permission to keep old feedback active: the existing relay freshness and ESP lease limits remain unchanged. Slow/failed requests can still create zero-output gaps. In the five-finger terminal, `ESP_LINK=LIVE` confirms fresh ESP replies independently of `QUEST=WAITING_FOR_VR / STALE_VR_DATA / RIGHT_HAND_TRACKING`; `LAST_REASON` is a saved firmware state/disarm reason, not current Wi-Fi connectivity.

## Play Orbit Foundry

1. Keep **Feedback hand = Right hand** for the game. Enter VR with bare hands, controllers put down. Open your right hand first.
2. Reach for a glowing core; its halo shows which one you can grab. Close your fingers around it, or pinch thumb and index near it. The first successful grab starts a 75-second shift.
3. Lift the core at least **8 cm**, carry it over the matching color dock at the back of the bench, and open your hand. The core falls onto the dock and earns points. A delivered core returns to its cradle.
4. Ion/mint is light (0.25 kg virtual), Flux/amber is medium (1 kg), Nova/violet is heavy (3 kg). Heavy cores earn more points and request more finger resistance. Consecutive correct deliveries build a combo.
5. Follow the floating panel's next action. Lift progress appears beside the held core; the matching dock glows and says **OPEN HERE** when aligned after lifting. Five small bars show the haptic preview. Raw percentages and vibration values are on the laptop; they are software requests, not force or servo angles. The Wi-Fi sender terminal's **ESP RECEIVED** confirms the board receipt; physical output remains OFF.
6. Touch the illuminated **NEW SHIFT** button at the right edge of the bench with your right index fingertip for **0.7 seconds** to restart. If tracking disappears, the core releases and requests clear; open your hand before picking up again.

On the laptop, use **Ion/Flux/Nova → Grab core → Lift 18 cm → Matching dock → Release core** for a synthetic rehearsal. The desktop page submits no commands, so it can also display live Quest receipts without replacing them. Use one live VR session at a time. The best score lasts for the current page visit.

Use **Preview VR panel** on the laptop to inspect the immersive scoreboard. It shows one action at a time rather than connection/debug arrays. Gesture and contact calculations still run every render frame; desktop readouts update at 10 Hz, the visible VR panel at up to 8 Hz. These are display refresh rates, not measurements of end-to-end Wi-Fi or actuator latency.

Plain `http://<laptop-IP>:8890/` is insufficient for WebXR. HTTPS is required for this wireless route; HTTP localhost is a special development exception. [MDN secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts)

On the laptop, `http://localhost:8890/` remains available for desktop rehearsal. Its hand motion is synthetic; no requests are submitted. The server additionally forces any synthetic requests to zero. Rehearsal does not prove Quest tracking.

For terminals you started, press **Ctrl+C** in each terminal when finished. This laptop's current background demo can be stopped by matching the recorded process IDs in `.build/quest-tunnel.pid`, `.build/webxr-server.pid`, and `.build/webxr-board.pid` to their AHAM processes. Keep the laptop awake while the headset is using the link.

## Check tracking before changing the glove

1. With bare hands, first open the [hand sample linked by Meta](https://immersive-web.github.io/webxr-samples/immersive-hands.html). Confirm both hands appear.
2. Open this prototype in Quest Browser. Move both wrists and bend each of the five fingers individually. Watch the right/left joint counts, wrist orientation and each finger's curl value. Clear tracking should provide up to 25 joints per visible hand.
3. Touch a core with each fingertip, then grasp it. Ion uses **95/255**, Flux **130/255**, Nova **155/255**. Grasp cues apply to all five available fingers; simple tip contact applies to the touching finger. Release/move away and verify zero. The channel order is thumb, index, middle, ring, little. These are chosen vibration cues, not measured force.
4. Hide the hand, interrupt tracking, and leave VR. Verify cues clear to zero on pose/session loss and old receipts become stale. A missing echo must never be presented as a fresh receipt.
5. Repeat with the actual glove, straps, motors, and cables attached. Keep the flex-sensor backup until this visibility test works reliably. Meta documents reduced accuracy from occlusion and coverings; compatibility with this custom glove is still unverified. [Meta tracking limitations](https://developers.meta.com/vr/design/hands-limitations-mitigations/)

WebXR does not expose OVRHand's hand/finger confidence values. A non-null joint pose means a pose is available; obscured joints may be emulated. Treat it as availability, not proof of a visible, accurately measured finger. [WebXR hand-input specification](https://immersive-web.github.io/webxr-hand-input/#xrjointspace)

Compare three separate results: **HTTP accepted** means the relay accepted a request; **monitor received** means an actual UDP echo returned; **board applied PWM** is firmware telemetry. Neither of the first two proves physical vibration. Board PWM should remain zero for this checkpoint.

## Four-person next checkpoint

| Person | Deliverable |
|---|---|
| 1: Headset | Establish the wireless HTTPS route, then demonstrate the bare-hand sample and prototype on Quest. |
| 2: Scene | Verify both hands, all five independent curls/contact cues, wrist movement and zero on tracking/session loss. |
| 3: Laptop/board | Verify the monitor echo separately from HTTP acceptance; record board telemetry with only one COM7 owner. |
| 4: Glove | Compare bare-hand and fitted-glove tracking; check cable/strap occlusion and retain the flex backup until results pass. |

After that checkpoint, implement actuator-only firmware and a verified motor driver circuit. Test vibration first. Follow the [servo-resistance plan](servo-resistance-plan.md) for the new request contract and the one-finger bench-first mechanism stage. Servo feedback needs a separate suitable supply and bounded mechanical testing before wearable use. The ESP8266 provides Wi-Fi and has no built-in BLE, so later wireless glove communication should use Wi-Fi or added hardware. [Espressif ESP8266 specifications](https://www.espressif.com/sites/default/files/documentation/0a-esp8266ex_datasheet_en.pdf), [Espressif provisioning guide](https://docs.espressif.com/_/downloads/esp-jumpstart/en/latest/pdf/)

The [Wi-Fi monitor guide](wifi-quickstart.md) now provides a receive-only PlatformIO environment and laptop sender. Use it to prove Quest-derived data reaches NodeMCU over a 2.4 GHz phone hotspot before adding any physical output. Stop the old USB bridge before flashing; this new firmware prints text at 115200 baud and does not send the old binary sensor telemetry.

## Optional USB development fallback

This is a fallback, not the selected wireless route. Enable Quest Developer Mode, connect USB, and accept USB debugging in the headset. ADB is available at the path below:

```powershell
& 'C:\Users\komka\AppData\Local\Android\Sdk\platform-tools\adb.exe' devices
& 'C:\Users\komka\AppData\Local\Android\Sdk\platform-tools\adb.exe' reverse tcp:8890 tcp:8890
```

Once the headset is listed as `device`, open `http://localhost:8890/` in Quest Browser. Keep USB connected. Meta explicitly documents this port-mapping workflow for WebXR development. [Meta browser debugging](https://developers.meta.com/vr/documentation/web/browser-remote-debugging/)
