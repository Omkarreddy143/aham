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
        private bool preview = true;
        private Vector2 scroll;
        private void Start()
        {
            transport = gameObject.AddComponent<AhamTransport>();
            GameObject root = new GameObject("AHAM Hand Root"); root.transform.position = new Vector3(0, 1, 0);
            hand = root.AddComponent<AhamHandRig>(); hand.transport = transport; hand.Build();
            hand.previewEnabled = preview;
            Camera camera = Camera.main;
            if (camera == null) { GameObject cameraObject = new GameObject("Main Camera"); cameraObject.tag = "MainCamera"; camera = cameraObject.AddComponent<Camera>(); }
            camera.rect = new Rect(.38f, 0, .62f, 1);
            camera.transform.position = new Vector3(.24f, 1.18f, .36f); camera.transform.LookAt(new Vector3(0, .97f, .08f));
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
            if (preview) return; // Software preview never sends haptic commands.
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
            GUILayout.BeginArea(new Rect(15, 15, Mathf.Min(360, Screen.width * .36f), Screen.height - 30), GUI.skin.box);
            scroll = GUILayout.BeginScrollView(scroll);
            GUILayout.Label("AHAM / INDEX FINGER DEMO");
            bool wantPreview = GUILayout.Toggle(preview, "Software preview: no hardware needed");
            if (wantPreview != preview)
            {
                if (wantPreview) { transport.SetOutgoing(false); outgoing = false; }
                preview = wantPreview; hand.previewEnabled = preview;
            }
            if (preview)
            {
                GUILayout.Label("SOFTWARE PREVIEW — motor commands blocked");
                hand.previewAuto = GUILayout.Toggle(hand.previewAuto, "Animate finger and wrist automatically");
                GUI.enabled = !hand.previewAuto;
                GUILayout.Label("Index bend"); hand.previewIndex = GUILayout.HorizontalSlider(hand.previewIndex, 0, 1);
                GUILayout.Label("Wrist tilt"); hand.previewPitch = GUILayout.HorizontalSlider(hand.previewPitch, -45, 45);
                GUILayout.Label("Wrist roll"); hand.previewRoll = GUILayout.HorizontalSlider(hand.previewRoll, -45, 45);
                GUI.enabled = true;
            }
            GUILayout.Label(transport.Status);
            if (!preview)
            {
                hand.useImuTilt = GUILayout.Toggle(hand.useImuTilt, "Use MPU6050 for slow wrist tilt");
                GUILayout.Label(transport.ImuFresh ? "MPU6050 data connected" : "MPU6050 absent / stale (optional)");
                GUI.enabled = transport.ImuFresh;
                if (GUILayout.Button("Center wrist in neutral pose")) hand.CenterImu();
                GUI.enabled = true;
            }
            GUILayout.Label("Hand root: " + (hand.requireTrackedRoot ? "external tracker" : "desktop preset (not VR tracking)"));
            GUI.enabled = !preview;
            bool enabled = GUILayout.Toggle(outgoing, "Enable outgoing commands after checking the connection");
            if (enabled != outgoing) { outgoing = enabled; transport.SetOutgoing(outgoing); }
            GUI.enabled = true;
            GloveTelemetry data = transport.Latest;
            if (data != null)
            {
                GUILayout.Label("State: " + data.State + " | Fault: " + data.Fault + " | Calibrated: " + ((data.Flags & 1) != 0));
                GUILayout.Label("Raw flex: " + string.Join(", ", System.Array.ConvertAll(data.Raw, n => n.ToString())));
                GUILayout.Label("Index bend from sensor: " + (data.Curls[1] / 10f).ToString("F1") + "%");
                if ((data.Flags & 1) == 0) GUILayout.Label("Finger motion needs calibration: enable commands, then capture straight and bent poses.");
                GUILayout.Label("Vibration: " + string.Join(", ", System.Array.ConvertAll(data.Vibration, n => n.ToString())));
                GUILayout.Label("Active flex mask: " + data.SensorMask + " | motor mask: " + data.MotorMask + " (2 = index only)");
                if (data.MotorMask == 0) GUILayout.Label("Motor output disabled; sensor/desktop checks only.");
            }
            GUI.enabled = !preview && outgoing && transport.Fresh;
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
            GUILayout.EndScrollView(); GUILayout.EndArea();
        }
    }
}
