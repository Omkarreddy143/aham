"""Generate a local board/laptop pairing key; never print or package secrets."""
import argparse
from pathlib import Path
import secrets
import shutil

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.parse_args()
include = root / "firmware/include"
private = root / "local-data"
private.mkdir(exist_ok=True)
header, key_file = include / "BenchSecrets.h", private / "wifi-bench.key"
if header.exists() or key_file.exists():
    if not header.exists() or not key_file.exists():
        raise SystemExit("Pairing files are incomplete. Preserve/check existing files before generating a new pair.")
    print("Existing pairing files retained. No key was changed.")
else:
    key = secrets.token_bytes(32)
    key_file.write_text(key.hex() + "\n", encoding="ascii")
    header.write_text("#pragma once\n#include <stdint.h>\nconstexpr uint8_t benchKey[32] = {" +
                      ",".join(f"0x{byte:02x}" for byte in key) + "};\n", encoding="ascii")
    print("Created private pairing files. Keep them local; do not share the key.")
config = include / "BenchConfig.h"
if not config.exists():
    shutil.copyfile(include / "BenchConfig.example.h", config)
print(f"Board pairing header: {header}")
print(f"Laptop key file: {key_file}")
print(f"Local hardware flags: {config} (motor/servo disabled initially)")
