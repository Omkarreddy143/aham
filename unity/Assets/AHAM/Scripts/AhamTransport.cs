using System;
using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using UnityEngine;

namespace Aham
{
    public sealed class AhamTransport : MonoBehaviour
    {
        public int telemetryPort = 8765, commandPort = 8766;
        public bool outgoingEnabled;
        public string Status { get; private set; }
        private UdpClient receiver, sender;
        private Thread worker;
        private volatile bool stopping;
        private readonly object gate = new object();
        private GloveTelemetry latest;
        private ImuTelemetry latestImu;
        private long imuReceivedAt;
        private long receivedAt;
        private ushort sequence;
        private bool previouslyFresh;
        public GloveTelemetry Latest { get { lock (gate) return latest; } }
        public ImuTelemetry LatestImu { get { lock (gate) return latestImu; } }
        public bool ImuFresh { get { lock (gate) return latestImu != null && latestImu.Valid && (Stopwatch.GetTimestamp() - imuReceivedAt) / (double)Stopwatch.Frequency < .2; } }
        public bool Fresh { get { lock (gate) return latest != null && (Stopwatch.GetTimestamp() - receivedAt) / (double)Stopwatch.Frequency < 0.15; } }

        private void OnEnable()
        {
            Application.runInBackground = true;
            stopping = false;
            try
            {
                receiver = new UdpClient(new IPEndPoint(IPAddress.Loopback, telemetryPort));
                receiver.Client.ReceiveTimeout = 100;
                sender = new UdpClient(); sender.Connect(IPAddress.Loopback, commandPort);
                worker = new Thread(ReadLoop); worker.IsBackground = true; worker.Start();
                Status = "Waiting for localhost glove telemetry";
            }
            catch (Exception error) { Status = error.Message; CloseSockets(); }
        }
        private void ReadLoop()
        {
            while (!stopping)
            {
                try
                {
                    IPEndPoint remote = new IPEndPoint(IPAddress.Any, 0);
                    byte[] frame = receiver.Receive(ref remote);
                    WirePacket packet; GloveTelemetry data;
                    if (!IPAddress.IsLoopback(remote.Address) || !AhamProtocol.TryDecode(frame, out packet)) continue;
                    ImuTelemetry imu;
                    if (AhamProtocol.TryImu(packet, out imu)) { lock (gate) { latestImu = imu; imuReceivedAt = Stopwatch.GetTimestamp(); } continue; }
                    if (!AhamProtocol.TryTelemetry(packet, out data)) continue;
                    lock (gate) { latest = data; receivedAt = Stopwatch.GetTimestamp(); }
                }
                catch (SocketException) { if (stopping) return; }
                catch (ObjectDisposedException) { return; }
            }
        }
        private void Update()
        {
            bool fresh = Fresh;
            if (!fresh && previouslyFresh) SendControl(0);
            previouslyFresh = fresh;
            if (sender != null) Status = fresh ? ((Latest.Flags & 32) != 0 ? "SIMULATED GLOVE" : "USB glove via local bridge") : "Telemetry absent/stale; output disarmed";
        }
        public void SetOutgoing(bool enabled)
        {
            if (!enabled) SendControl(0);
            outgoingEnabled = enabled;
            if (enabled) SendControl(0); // Establish a fresh, explicitly disarmed command sequence.
        }
        public void SendControl(byte action)
        {
            if (!outgoingEnabled || sender == null || (action != 0 && !Fresh)) return;
            Send(AhamProtocol.MakeControl(sequence++, TimeMs(), action));
        }
        public void SendHaptics(byte[] duties, byte[] patterns)
        {
            if (!outgoingEnabled || !Fresh || Latest.State != 2 || sender == null) return;
            Send(AhamProtocol.MakeHaptic(sequence++, TimeMs(), duties, patterns));
        }
        private static uint TimeMs() { return unchecked((uint)(Stopwatch.GetTimestamp() * 1000L / Stopwatch.Frequency)); }
        private void Send(WirePacket packet)
        {
            try { byte[] data = AhamProtocol.Encode(packet); sender.Send(data, data.Length); }
            catch (SocketException error) { Status = error.Message; outgoingEnabled = false; }
            catch (ObjectDisposedException) { outgoingEnabled = false; }
        }
        private void OnApplicationPause(bool paused) { if (paused) SendControl(0); }
        private void OnDisable() { SendControl(0); stopping = true; CloseSockets(); if (worker != null) worker.Join(300); lock (gate) { latest = null; latestImu = null; } }
        private void CloseSockets() { if (receiver != null) receiver.Close(); if (sender != null) sender.Close(); receiver = sender = null; }
    }
}
