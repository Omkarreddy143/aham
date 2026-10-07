"""Regenerate cross-language wire fixtures after a deliberate protocol change."""
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'host'))
from aham.protocol import Packet, TELEMETRY, TELEMETRY_PAYLOAD, control, haptic

packets = [control(0,0,0),control(1,1000,2),haptic(65535,0xFFFFFFFF,[0,40,80,120,255],[0,1,2,3,0]),
           Packet(TELEMETRY,42,123456,TELEMETRY_PAYLOAD.pack(2,39,0,0,250,500,750,1000,900,1350,1800,2250,2700,0,0,40,0,160,0,1))]
target=Path(__file__).resolve().parents[1]/'tests'/'fixtures'/'wire.txt'
target.parent.mkdir(parents=True,exist_ok=True)
target.write_text('\n'.join(f'{p.kind}|{p.sequence}|{p.time_ms}|{p.payload.hex()}|{p.encode().hex()}' for p in packets)+'\n')
print('Generated',target)
