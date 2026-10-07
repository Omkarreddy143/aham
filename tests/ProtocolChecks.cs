using System;
using System.IO;
using Aham;

public static class ProtocolChecks
{
    private static byte[] Hex(string text) { byte[] result = new byte[text.Length / 2]; for (int i = 0; i < result.Length; i++) result[i] = Convert.ToByte(text.Substring(i * 2, 2), 16); return result; }
    private static void Check(bool ok, string message) { if (!ok) throw new Exception(message); }
    public static void Main(string[] args)
    {
        Check(AhamProtocol.Crc(System.Text.Encoding.ASCII.GetBytes("123456789"), 9) == 0x29b1, "CRC check vector");
        int count = 0;
        foreach (string line in File.ReadAllLines(args[0]))
        {
            if (line.Length == 0) continue;
            string[] f = line.Split('|'); byte[] frame = Hex(f[4]); WirePacket p;
            Check(AhamProtocol.TryDecode(frame, out p), "C# decode");
            Check(p.Type == byte.Parse(f[0]) && p.Sequence == ushort.Parse(f[1]) && p.TimeMs == uint.Parse(f[2]) && BitConverter.ToString(p.Payload) == BitConverter.ToString(Hex(f[3])), "C# fields");
            Check(BitConverter.ToString(AhamProtocol.Encode(p)) == BitConverter.ToString(frame), "C# encoder differs from Python fixture");
            if (p.Type == 1) { GloveTelemetry t; Check(AhamProtocol.TryTelemetry(p, out t) && t.Curls[4] == 1000 && t.Vibration[3] == 160, "telemetry field offsets"); }
            for (int bit = 0; bit < 8; bit++) { byte[] corrupt = (byte[])frame.Clone(); corrupt[frame.Length - 2] ^= (byte)(1 << bit); WirePacket bad; Check(!AhamProtocol.TryDecode(corrupt, out bad), "corrupted CRC accepted"); }
            count++;
        }
        WirePacket command = AhamProtocol.MakeHaptic(9, 10, new byte[] {0,40,80,120,160}, new byte[] {0,1,2,3,0});
        Check(command.Payload[12] == 0 && command.Payload[13] == 0 && command.Payload[14] == 0, "pressure must remain disabled");
        ushort[] capabilities = {1, 8, 265, 4093, 0};
        int[] sensors = {31, 2, 2, 31, 0}, motors = {31, 0, 2, 31, 0};
        for (int i = 0; i < capabilities.Length; i++) {
            byte[] payload = new byte[33]; AhamProtocol.Put16(payload, 31, capabilities[i]);
            WirePacket packet = new WirePacket { Type = 1, Payload = payload }; GloveTelemetry t;
            Check(AhamProtocol.TryTelemetry(packet, out t) && t.SensorMask == sensors[i] && t.MotorMask == motors[i], "active masks including legacy firmware");
        }
        Console.WriteLine("PASS: C# codec interoperability for " + count + " fixtures and corruption checks");
        byte[] imuPayload = new byte[13]; imuPayload[0] = 1;
        short[] axes = {-16384, 123, 16384, -32768, 32767, -131};
        for (int i = 0; i < 6; ++i) AhamProtocol.Put16(imuPayload, 1 + i * 2, unchecked((ushort)axes[i]));
        WirePacket imuWire; ImuTelemetry imu;
        Check(AhamProtocol.TryDecode(AhamProtocol.Encode(new WirePacket {Type=4, Payload=imuPayload}), out imuWire) && AhamProtocol.TryImu(imuWire, out imu), "IMU decode");
        AhamProtocol.TryImu(imuWire, out imu);
        Check(imu.Accel[0] == -16384 && imu.Gyro[0] == -32768 && imu.Gyro[1] == 32767, "signed IMU axes");
        float roll, pitch;
        imu.Accel = new short[] {0,0,16384};
        Check(ImuTilt.TryAngles(imu, out roll, out pitch) && Math.Abs(roll) < .01 && Math.Abs(pitch) < .01, "upright gravity tilt");
        imu.Accel = new short[] {0,11585,11585};
        Check(ImuTilt.TryAngles(imu, out roll, out pitch) && Math.Abs(roll-45) < .1, "roll tilt");
        imu.Accel = new short[] {-11585,0,11585};
        Check(ImuTilt.TryAngles(imu, out roll, out pitch) && Math.Abs(pitch-45) < .1, "pitch tilt");
        imu.Accel = new short[] {0,0,0}; Check(!ImuTilt.TryAngles(imu, out roll, out pitch), "zero gravity rejected");
        imu.Valid = false; Check(!ImuTilt.TryAngles(imu, out roll, out pitch), "invalid IMU rejected");
        imuPayload[0] = 2; Check(!AhamProtocol.TryImu(new WirePacket {Type=4,Payload=imuPayload}, out imu), "unknown IMU flags rejected");
        byte[] cueDuty, cuePattern;
        WirePacket cuePacket = AhamProtocol.MakeHaptic(1, 0, new byte[] {0,100,0,0,0}, new byte[] {0,1,0,0,0});
        Check(AhamProtocol.TryCue(cuePacket, out cueDuty, out cuePattern) && cueDuty[1] == 100 && cuePattern[1] == 1, "monitor cue");
        cuePacket.Payload[12] = 1;
        Check(!AhamProtocol.TryCue(cuePacket, out cueDuty, out cuePattern), "monitor rejects pressure");
        cuePacket.Payload[12] = 0; cuePacket.Payload[3] = 161;
        Check(!AhamProtocol.TryCue(cuePacket, out cueDuty, out cuePattern), "monitor rejects excessive duty");
        Console.WriteLine("PASS: signed IMU packet and gravity tilt checks");
    }
}
