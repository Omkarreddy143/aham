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
    }
}
