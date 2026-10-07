# Quest to NodeMCU over a 2.4 GHz phone hotspot

This is a **receive-and-print test**, ready to upload with PlatformIO. It transfers five vibration values and five resistance requests to the ESP8266 over Wi-Fi. Motors and servos stay disabled. No flex sensor, MPU6050 or PCA9685 connection is needed for this data test.

```text
Quest Browser -> existing HTTPS scene -> laptop relay
  -> local UDP over phone hotspot -> NodeMCU Wi-Fi receiver
  <- matching data receipt from NodeMCU
```

Your ESP-12E NodeMCU V3 is an **ESP8266**, supporting 2.4 GHz Wi-Fi. The Arduino core supports Wi-Fi UDP. [Espressif datasheet](https://documentation.espressif.com/0a-esp8266ex_datasheet_en.html), [ESP8266 UDP documentation](https://arduino-esp8266.readthedocs.io/en/latest/esp8266wifi/udp-examples.html)

The laptop stays in the path: the HTTPS Quest page sends to its existing relay; that relay's local companion sends LAN UDP to the glove. Direct fetches from the HTTPS scene to a plain HTTP ESP server face browser mixed-content restrictions. [MDN mixed content](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Mixed_content)

## 1. Join the hotspot

On the phone, enable mobile data and a **2.4 GHz** hotspot with a normal password. Connect the laptop to it. Quest can use the same hotspot, or another Internet connection; the laptop and NodeMCU **must** share a reachable LAN. The temporary HTTPS scene still needs Internet access. Keep the existing tunnel running while changing laptop networks; wait for it to reconnect and check the scene link again. Restarting the tunnel may change its URL; follow the WebXR quickstart if necessary.

Some hotspots isolate connected devices. If the ESP joins successfully but UDP receipts never arrive, use a router/hotspot that allows device-to-device traffic.

On the laptop, run `ipconfig`. Under **Wireless LAN adapter Wi-Fi**, copy **IPv4 Address**. Ignore WSL and VMware adapters. The laptop was on event Wi-Fi when this guide was prepared; its previous address is not the address to use after switching to the phone.

## 2. Add credentials locally

Use the new [Wi-Fi monitor ZIP](../artifacts/AHAM-WiFi-Monitor.zip), or the updated repository. In VS Code open its **firmware** folder.

Inside `firmware/include`, copy `WifiSecrets.example.h` and name the copy **WifiSecrets.h**. Edit only the copy:

```cpp
#pragma once
#define AHAM_WIFI_SSID "your phone hotspot name"
#define AHAM_WIFI_PASSWORD "your hotspot password"
#define AHAM_LAPTOP_IP "the laptop Wi-Fi IPv4 from step 1"
```

Keep the double quotes. Do not paste the password into chat or the example file. `WifiSecrets.h` is Git-ignored and excluded from starter ZIPs. The firmware does not print the password.

## 3. Upload the Wi-Fi receiver

Keep the motor/servo supplies disconnected for this receive-only test. Keep NodeMCU on USB for upload, power and readable logs.

Close Serial Monitor and stop the **old USB bridge** before uploading: only one application can own COM7. If you started the bridge in a terminal, press Ctrl+C there. For this laptop's background AHAM bridge, verify its recorded process before stopping it, from the Makethon root:

```powershell
$ahamRoot = (Get-Location).Path
$bridgeId = [int](Get-Content .build/webxr-board.pid)
$bridgeProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $bridgeId"
if ($bridgeProcess -and $bridgeProcess.ExecutablePath -eq "$ahamRoot\.venv\Scripts\python.exe" -and
    $bridgeProcess.CommandLine -match 'host/run\.py bridge --port COM7') {
    Stop-Process -Id $bridgeId
} else { Write-Output 'Bridge identity differs; leave it untouched and check COM7 owner.' }
```

Select PlatformIO environment **nodemcu_wifi_monitor**, then Upload. In the Wi-Fi ZIP, this is the only/default environment. In the full repository, choose it explicitly; the default `nodemcuv2` environment is the older sensor firmware.

Equivalent command from the **firmware** folder, using your PlatformIO terminal:

```powershell
pio run -e nodemcu_wifi_monitor -t upload --upload-port COM7
```

This replaces the uploaded sensor firmware with a receive-only Wi-Fi monitor. The old source and calibration storage remain available as a fallback. No motor/servo commands are implemented in this environment. The existing USB bridge is not used with its text output.

## 4. Read the ESP's IP

Open PlatformIO Serial Monitor on COM7 at **115200 baud**:

```powershell
pio device monitor --port COM7 --baud 115200
```

It should print:

```text
AHAM WIFI MONITOR: MOTOR/SERVO OUTPUT OFF; order T/I/M/R/L
ESP_IP=192.168.43.42 UDP=4210
Allowed laptop=192.168.43.2
```

Those addresses are examples. Copy your printed **ESP_IP**. If it says copy/configure secrets, edit the header and upload again. If it waits for Wi-Fi, check hotspot name/password, 2.4 GHz mode and ordinary WPA/WPA2 support. If the laptop changes networks or its IPv4 changes, update `AHAM_LAPTOP_IP` and upload again.

## 5. Start the laptop Wi-Fi sender

Keep the current WebXR relay/tunnel running. Its new `/api/wifi-preview` endpoint must be available; the live service was refreshed during this update. A fresh checkout runs the server as described in the WebXR quickstart. There is no new inbound LAN server or public actuator endpoint.

Open another terminal in the **Makethon repository root** and replace the example IP:

```powershell
.\.venv\Scripts\python.exe host/run.py wifi-monitor --esp-ip 192.168.43.42
```

For the separate Wi-Fi ZIP, run `python host/run.py wifi-monitor --esp-ip YOUR_ESP_IP` from its extracted root while the existing WebXR server is running on this laptop. This companion needs Python but no pyserial package and does not open COM7. You can keep Serial Monitor open.

The sender targets only the supplied private ESP IP at UDP port 4210. It polls the loopback relay and submits preview packets at up to 20 Hz. The receiver accepts packets only from the configured laptop IP. No general firewall bypass or inbound firewall rule is added automatically.

## 6. Test from Quest

Reload the Quest scene, enter Orbit Foundry v3, open the right hand, and grab a core. Watch the ESP's Serial Monitor:

```text
LINK=LIVE VIB=[155,155,155,155,155] RES%=[50,55,58,52,48] CURL%=[30,50,60,45,35] HOLD=1 OUTPUT=OFF
```

Values vary with your gesture. The order is **thumb, index, middle, ring, little**. `VIB` is the chosen vibration cue; `RES%` is the dimensionless resistance request; `CURL%` is the pose captured at grab. Opening clears resistance. Hiding the hand/leaving VR clears requests. Stopping the laptop sender makes the ESP show `LINK=STALE` and zero requests after its 250 ms packet lease expires.

The laptop sender prints **ESP RECEIVED** only after a matching UDP receipt actually returns from the ESP. That proves data receipt, not physical output. The browser's original **Bridge received** field belongs to the USB cue echo; it can become empty after stopping that bridge. Use the sender terminal and ESP Serial Monitor for this Wi-Fi checkpoint.

After verification, a suitable USB power bank can power NodeMCU while removing the laptop data cable. Servos still need their separately rated supply, common signal ground, validated release mechanism and actuator-only firmware; the Wi-Fi monitor does not control them. See [servo-resistance plan](servo-resistance-plan.md).

## Transport checks and limits

Types 5/6 are separate observation packets, using the existing version-1 CRC/COBS envelope. Type 5 contains session ID, 100–250 ms lease, cue/holding flags and five values each for vibration, pattern, resistance and captured curl. Type 6 echoes session/sequence/payload CRC and reports motor mask 0 and servo-enabled 0. Duplicate/out-of-order sequences and mismatched receipts are rejected; sequence wrap and sender restart after expiry are supported. A stopped relay sends zeros instead of retaining a hold.

The CRC detects corruption, not a malicious sender. Peer IP filtering is not authentication. This is a data monitor on your hotspot, not a validated wearable actuator-control protocol. Physical output needs authenticated/local control, explicit arming, measured mechanical limits, an independent watchdog and release. The public HTTPS tunnel remains a demo/monitor route.

Software build, Python UDP tests and native firmware interoperability tests pass. Actual hotspot joining, client reachability, packet timing and the flashed ESP's receipt remain to be verified by the steps above.
