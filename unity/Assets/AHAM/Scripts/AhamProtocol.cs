using System;

namespace Aham
{
    public sealed class WirePacket
    {
        public byte Type;
        public ushort Sequence;
        public uint TimeMs;
        public byte[] Payload;
    }

    public sealed class GloveTelemetry
    {
        public byte State, Fault;
        public ushort Flags, Capabilities;
        public int SensorMask { get { return Capabilities == 1 ? 31 : (Capabilities >> 2) & 31; } }
        public int MotorMask { get { return Capabilities == 1 ? 31 : (Capabilities >> 7) & 31; } }
        public ushort[] Curls = new ushort[5], Raw = new ushort[5];
        public byte[] Vibration = new byte[5];
        public ushort Fsr;
        public ushort Sequence;
        public uint TimeMs;
    }

    public sealed class ImuTelemetry
    {
        public bool Valid;
        public short[] Accel = new short[3], Gyro = new short[3];
    }

    public static class AhamProtocol
    {
        public const byte Version = 1, Telemetry = 1, Haptic = 2, Control = 3, Imu = 4;
        public static bool TryImu(WirePacket p, out ImuTelemetry data)
        {
            data = null;
            if (p == null || p.Type != Imu || p.Payload.Length != 13 || (p.Payload[0] & ~1) != 0) return false;
            ImuTelemetry result = new ImuTelemetry { Valid = (p.Payload[0] & 1) != 0 };
            for (int i = 0; i < 3; i++) { result.Accel[i] = unchecked((short)Read16(p.Payload, 1 + i * 2)); result.Gyro[i] = unchecked((short)Read16(p.Payload, 7 + i * 2)); }
            data = result; return true;
        }
        public static ushort Read16(byte[] p, int offset) { return (ushort)(p[offset] | p[offset + 1] << 8); }
        public static uint Read32(byte[] p, int offset) { return (uint)(Read16(p, offset) | (uint)Read16(p, offset + 2) << 16); }
        public static void Put16(byte[] p, int offset, ushort value) { p[offset] = (byte)value; p[offset + 1] = (byte)(value >> 8); }
        public static void Put32(byte[] p, int offset, uint value) { Put16(p, offset, (ushort)value); Put16(p, offset + 2, (ushort)(value >> 16)); }
        public static ushort Crc(byte[] data, int length)
        {
            ushort crc = 65535;
            for (int i = 0; i < length; i++)
            {
                crc ^= (ushort)(data[i] << 8);
                for (int b = 0; b < 8; b++) crc = (ushort)((crc << 1) ^ ((crc & 32768) != 0 ? 0x1021 : 0));
            }
            return crc;
        }
        public static byte[] Encode(WirePacket packet)
        {
            if (packet.Payload == null || packet.Payload.Length > 54) throw new ArgumentException("Invalid payload length");
            byte[] raw = new byte[packet.Payload.Length + 10];
            raw[0] = Version; raw[1] = packet.Type; Put16(raw, 2, packet.Sequence); Put32(raw, 4, packet.TimeMs);
            Array.Copy(packet.Payload, 0, raw, 8, packet.Payload.Length); Put16(raw, raw.Length - 2, Crc(raw, raw.Length - 2));
            byte[] framed = new byte[raw.Length + 2];
            int codeAt = 0, at = 1; byte code = 1;
            foreach (byte value in raw)
            {
                if (value == 0) { framed[codeAt] = code; codeAt = at++; code = 1; }
                else { framed[at++] = value; code++; }
            }
            framed[codeAt] = code; framed[at++] = 0;
            return framed;
        }
        public static bool TryDecode(byte[] frame, out WirePacket packet)
        {
            packet = null;
            if (frame == null || frame.Length < 2 || frame.Length > 66 || frame[frame.Length - 1] != 0) return false;
            byte[] raw = new byte[64]; int at = 0, count = 0, length = frame.Length - 1;
            while (at < length)
            {
                byte code = frame[at++];
                if (code == 0 || at + code - 1 > length) return false;
                for (int i = 1; i < code; i++)
                {
                    if (count >= 64 || frame[at] == 0) return false;
                    raw[count++] = frame[at++];
                }
                if (code != 255 && at < length) { if (count >= 64) return false; raw[count++] = 0; }
            }
            if (count < 10 || raw[0] != Version || Crc(raw, count - 2) != Read16(raw, count - 2)) return false;
            byte[] payload = new byte[count - 10]; Array.Copy(raw, 8, payload, 0, payload.Length);
            packet = new WirePacket { Type = raw[1], Sequence = Read16(raw, 2), TimeMs = Read32(raw, 4), Payload = payload };
            return true;
        }
        public static bool TryTelemetry(WirePacket p, out GloveTelemetry data)
        {
            data = null;
            if (p == null || p.Type != Telemetry || p.Payload.Length != 33 || p.Payload[0] > 3) return false;
            byte[] b = p.Payload;
            GloveTelemetry t = new GloveTelemetry { State = b[0], Flags = Read16(b, 1), Fault = b[3], Fsr = Read16(b, 24), Capabilities = Read16(b, 31), Sequence = p.Sequence, TimeMs = p.TimeMs };
            for (int i = 0; i < 5; i++)
            {
                t.Curls[i] = Read16(b, 4 + 2 * i); if (t.Curls[i] > 1000) return false;
                t.Raw[i] = Read16(b, 14 + 2 * i); t.Vibration[i] = b[26 + i];
            }
            data = t; return true;
        }
        public static WirePacket MakeControl(ushort seq, uint time, byte action)
        {
            if (action > 4) throw new ArgumentException("Invalid control action");
            return new WirePacket { Type = Control, Sequence = seq, TimeMs = time, Payload = new byte[] { action } };
        }
        public static WirePacket MakeHaptic(ushort seq, uint time, byte[] duties, byte[] patterns)
        {
            if (duties.Length != 5 || patterns.Length != 5) throw new ArgumentException("Five channels required");
            byte[] payload = new byte[15]; Put16(payload, 0, 100);
            for (int i = 0; i < 5; i++)
            {
                if (patterns[i] > 3) throw new ArgumentException("Invalid pattern");
                payload[2 + i] = duties[i]; payload[7 + i] = patterns[i];
            }
            // Pressure target and actuator mode remain zero: vibration-only starter.
            return new WirePacket { Type = Haptic, Sequence = seq, TimeMs = time, Payload = payload };
        }
        public static bool TryCue(WirePacket packet, out byte[] duties, out byte[] patterns)
        {
            duties = patterns = null;
            if (packet == null || packet.Type != Haptic || packet.Payload.Length != 15) return false;
            byte[] b = packet.Payload;
            if (Read16(b, 0) < 1 || Read16(b, 0) > 100 || Read16(b, 12) != 0 || b[14] != 0) return false;
            for (int i = 0; i < 5; i++) if (b[2 + i] > 160 || b[7 + i] > 3) return false;
            duties = new byte[5]; patterns = new byte[5];
            Array.Copy(b, 2, duties, 0, 5); Array.Copy(b, 7, patterns, 0, 5); return true;
        }
    }
}
