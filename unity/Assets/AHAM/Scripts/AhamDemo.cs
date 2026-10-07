using UnityEngine;

namespace Aham
{
    public sealed class AhamDemo : MonoBehaviour
    {
        private AhamTransport transport;
        private AhamHandRig hand;
        private float nextCommand;
        private readonly byte[] duties = new byte[5], patterns = new byte[5];
        private bool outgoing;
        private void Start()
        {
            transport = gameObject.AddComponent<AhamTransport>();
            GameObject root = new GameObject("AHAM Hand Root"); root.transform.position = new Vector3(0, 1, 0);
            hand = root.AddComponent<AhamHandRig>(); hand.transport = transport; hand.Build();
            Camera camera = Camera.main;
            if (camera == null) { GameObject cameraObject = new GameObject("Main Camera"); cameraObject.tag = "MainCamera"; camera = cameraObject.AddComponent<Camera>(); }
            camera.transform.position = new Vector3(.35f, 1.35f, -.55f); camera.transform.LookAt(new Vector3(0, .96f, .12f));
            camera.backgroundColor = new Color(.06f, .09f, .14f); camera.clearFlags = CameraClearFlags.SolidColor;
            GameObject lightObject = new GameObject("Demo Light"); Light light = lightObject.AddComponent<Light>(); light.type = LightType.Directional; light.intensity = 1.2f; light.transform.rotation = Quaternion.Euler(50, -30, 0);
            CreateSurface("Smooth", -.08f, new Color(.3f, .55f, .75f), 100, 1, 3);
            CreateSurface("Rough", 0, new Color(.75f, .5f, .25f), 150, 2, 2);
            CreateSurface("Soft", .08f, new Color(.55f, .4f, .7f), 80, 3, 1);
        }
        private static void CreateSurface(string name, float x, Color color, int duty, int pattern, int priority)
        {
            GameObject surface = GameObject.CreatePrimitive(PrimitiveType.Cube); surface.name = name;
            surface.transform.position = new Vector3(x, .92f, .13f); surface.transform.localScale = new Vector3(.067f, .065f, .14f);
            surface.GetComponent<Renderer>().material.color = color;
            HapticSurface haptic = surface.AddComponent<HapticSurface>(); haptic.intensity = duty; haptic.pattern = pattern; haptic.priority = priority;
        }
        private void Update()
        {
            if (transport == null || hand == null || Time.unscaledTime < nextCommand) return;
            nextCommand = Time.unscaledTime + .02f;
            GloveTelemetry data = transport.Latest;
            for (int i = 0; i < 5; i++)
            {
                bool channelAvailable = data != null && (data.SensorMask & data.MotorMask & (1 << i)) != 0;
                HapticSurface surface = channelAvailable && hand.RootValid && hand.tips[i] != null ? hand.tips[i].Surface : null;
                duties[i] = surface == null ? (byte)0 : (byte)Mathf.Clamp(surface.intensity, 0, 160);
                patterns[i] = surface == null ? (byte)0 : (byte)surface.pattern;
            }
            if (!hand.RootValid) transport.SendControl(0);
            else transport.SendHaptics(duties, patterns);
        }
        private void OnGUI()
        {
            if (transport == null || hand == null) return;
            GUILayout.BeginArea(new Rect(15, 15, 440, 450), GUI.skin.box);
            GUILayout.Label("AHAM / DESKTOP STARTER"); GUILayout.Label(transport.Status);
            GUILayout.Label("Hand root: " + (hand.requireTrackedRoot ? "external tracker" : "desktop preset (not VR tracking)"));
            bool enabled = GUILayout.Toggle(outgoing, "Enable outgoing commands after checking the connection");
            if (enabled != outgoing) { outgoing = enabled; transport.SetOutgoing(outgoing); }
            GloveTelemetry data = transport.Latest;
            if (data != null)
            {
                GUILayout.Label("State: " + data.State + " | Fault: " + data.Fault + " | Calibrated: " + ((data.Flags & 1) != 0));
                GUILayout.Label("Raw flex: " + string.Join(", ", System.Array.ConvertAll(data.Raw, n => n.ToString())));
                GUILayout.Label("Vibration: " + string.Join(", ", System.Array.ConvertAll(data.Vibration, n => n.ToString())));
                GUILayout.Label("Active flex mask: " + data.SensorMask + " | motor mask: " + data.MotorMask + " (2 = index only)");
                if (data.MotorMask == 0) GUILayout.Label("Motor output disabled; sensor/desktop checks only.");
            }
            GUI.enabled = outgoing && transport.Fresh;
            GUILayout.BeginHorizontal();
            if (GUILayout.Button("Capture open")) transport.SendControl(2);
            if (GUILayout.Button("Capture closed")) transport.SendControl(3);
            GUILayout.EndHorizontal(); GUILayout.BeginHorizontal();
            if (GUILayout.Button("Arm")) transport.SendControl(1);
            if (GUILayout.Button("Disarm")) transport.SendControl(0);
            if (GUILayout.Button("Clear fault")) transport.SendControl(4);
            GUILayout.EndHorizontal(); GUI.enabled = true;
            GUILayout.Label("Desktop hand depth"); hand.desktopDepth = GUILayout.HorizontalSlider(hand.desktopDepth, -.1f, .18f);
            GUILayout.Label("Pressure output disabled. Curl fingertips down to touch the colored blocks.");
            GUILayout.EndArea();
        }
    }
}
