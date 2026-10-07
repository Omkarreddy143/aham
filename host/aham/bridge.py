"""USB-to-local-UDP transport. Never auto-arms; no HTTP actuator endpoint."""
import argparse
import socket
import time
from .protocol import StreamDecoder, TELEMETRY, IMU_TELEMETRY, CONTROL, HAPTIC, control, decode, telemetry, imu_telemetry


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", required=True, help="Verified USB serial port, e.g. COM5")
    parser.add_argument("--baud", type=int, default=230400)
    parser.add_argument("--command-port", type=int, default=8766)
    parser.add_argument("--telemetry-port", type=int, default=8765)
    parser.add_argument("--stats", action="store_true", help="Print one-second raw flex min/max ranges while forwarding to Unity")
    args = parser.parse_args()
    import serial  # Only real-hardware mode requires pyserial.
    commands = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    commands.bind(("127.0.0.1", args.command_port))
    commands.setblocking(False)
    outbound = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    decoder = StreamDecoder()
    with serial.Serial(args.port, args.baud, timeout=.01, write_timeout=.05) as device:
        # Opening some ESP32 boards resets them. Discard boot chatter, then establish a disarmed session.
        time.sleep(2)
        device.reset_input_buffer()
        device.write(control(0, 0, 0).encode())
        print(f"AHAM USB {args.port}; Unity UDP {args.telemetry_port}/{args.command_port}. DISARMED; calibrate and arm explicitly.", flush=True)
        window_start = time.monotonic()
        raw_min, raw_max = [65535] * 5, [0] * 5
        sample_count = 0
        latest_values = None
        try:
            while True:
                packets = decoder.feed(device.read(min(max(device.in_waiting, 1), 512)))
                latest = None
                for packet in packets:
                    if packet.kind == TELEMETRY:
                        try:
                            values = telemetry(packet)
                            latest = packet
                            if args.stats:
                                latest_values = values
                                sample_count += 1
                                for i, raw in enumerate(values["raw"]):
                                    raw_min[i] = min(raw_min[i], raw)
                                    raw_max[i] = max(raw_max[i], raw)
                        except ValueError:
                            pass
                    elif packet.kind == IMU_TELEMETRY:
                        try:
                            imu_telemetry(packet)
                            outbound.sendto(packet.encode(), ("127.0.0.1", args.telemetry_port))
                        except ValueError:
                            pass
                if latest:
                    outbound.sendto(latest.encode(), ("127.0.0.1", args.telemetry_port))
                if args.stats and time.monotonic() - window_start >= 1:
                    if sample_count:
                        ranges = ", ".join(
                            f"finger {i}: {raw_min[i]}..{raw_max[i]}"
                            for i in range(5) if latest_values["sensor_mask"] & (1 << i)
                        )
                        print(f"RAW 1s | {ranges} | samples={sample_count} | state={latest_values['state']} "
                              f"fault={latest_values['fault']} | masks={latest_values['sensor_mask']}/{latest_values['motor_mask']}", flush=True)
                    else:
                        print("RAW 1s | No valid telemetry received; check USB link and uploaded firmware.", flush=True)
                    window_start = time.monotonic()
                    raw_min, raw_max = [65535] * 5, [0] * 5
                    sample_count = 0
                for _ in range(16):
                    try:
                        frame, sender = commands.recvfrom(256)
                    except BlockingIOError:
                        break
                    if sender[0] != "127.0.0.1":
                        continue
                    try:
                        packet = decode(frame)
                        if packet.kind in (CONTROL, HAPTIC):
                            device.write(frame)
                    except ValueError:
                        pass
        except KeyboardInterrupt:
            pass
        finally:
            try:
                device.write(control(0, 0, 0).encode())
                device.flush()
            except serial.SerialException:
                pass  # Firmware's lease/stop remain independent of the host.
            commands.close()
            outbound.close()


if __name__ == "__main__":
    main()
