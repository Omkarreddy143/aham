"""Check AHAM's relay, public HTTPS link and paired ESP without arming hardware."""
import argparse
import ipaddress
import json
from pathlib import Path
import re
import socket
import sys
import time
from urllib.request import ProxyHandler, build_opener

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "host"))
from aham.wifi_bench import read_key
from aham.wifi_discovery import discover


def http_check(url):
    started = time.monotonic()
    try:
        with build_opener(ProxyHandler({})).open(url, timeout=6) as response:
            body = response.read(16384)
            return {"ok": response.status == 200, "milliseconds": round((time.monotonic()-started)*1000),
                    "data": json.loads(body) if "/api/" in url else None}
    except (OSError, ValueError) as error:
        return {"ok": False, "error": str(error)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--discover", metavar="LOCAL_SUBNET", help="Probe only this private /24 or smaller subnet for the paired ESP")
    parser.add_argument("--esp-ip", help="Override the last recorded ESP address")
    parser.add_argument("--origin", help="Override the recorded public HTTPS origin")
    args = parser.parse_args()
    metadata = ROOT / ".build/quest-wireless.json"
    settings = json.loads(metadata.read_text(encoding="utf-8-sig")) if metadata.exists() else {}
    esp_ip = args.esp_ip or settings.get("espIp")
    if not esp_ip:
        parser.error("Supply --esp-ip or start the wireless demo first")
    ipaddress.IPv4Address(esp_ip)
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as route:
        route.connect((esp_ip, 4212))
        laptop_ip = route.getsockname()[0]
    expected = None
    secrets_path = ROOT / "firmware/include/WifiSecrets.h"
    if secrets_path.exists():
        match = re.search(r'#define\s+AHAM_LAPTOP_IP\s+"([0-9.]+)"', secrets_path.read_text(encoding="utf-8-sig"))
        expected = match.group(1) if match else None
    print(f"LAPTOP_IP={laptop_ip} CONFIGURED_IP={expected or 'unknown'} MATCH={laptop_ip == expected}", flush=True)
    local = http_check(f"http://127.0.0.1:{settings.get('httpPort', 8890)}/api/status")
    print("LOCAL_RELAY="+json.dumps(local), flush=True)
    origin = args.origin or settings.get("origin")
    if origin:
        print("QUEST_URL="+origin+"/", flush=True)
        print("HTTPS_LINK="+json.dumps(http_check(origin+"/api/status")), flush=True)
    result = discover(esp_ip, read_key(ROOT / "local-data/wifi-bench.key"),
                      port=settings.get("espPort", 4212), network=args.discover)
    print("ESP_PAIRED="+json.dumps(result), flush=True)
    if result is None:
        print("No paired ESP reply. Check NodeMCU power, the saved hotspot, client isolation and the configured laptop IP.", flush=True)


if __name__ == "__main__":
    main()
