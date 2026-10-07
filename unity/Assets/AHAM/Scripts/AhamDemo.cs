using UnityEngine;

namespace Aham
{
    public sealed class AhamDemo : MonoBehaviour
    {
        private AhamTransport transport;
        private AhamHandRig hand;
        private float nextCommand;
        private readonly byte[] duties = new byte[5], patterns = new byte[5];
        private readonly byte[] cueDuties = new byte[5], cuePatterns = new byte[5];
        private bool cueMonitor = true;
        private bool outgoing;
        private bool preview = true;
        private Vector2 scroll;
        private bool advanced;
        private GUIStyle titleStyle,sectionStyle,valueStyle,panelStyle;
        private Texture2D panelTexture;
        private HapticSurface[] targets;
        private float PanelWidth { get { return Mathf.Min(350, Mathf.Max(270, Screen.width*.30f)); } }
        private void Start()
        {
            transport = gameObject.AddComponent<AhamTransport>();
            GameObject root = new GameObject("AHAM Hand Root"); root.transform.position = new Vector3(0, 1, 0);
            hand = root.AddComponent<AhamHandRig>(); hand.transport = transport; hand.Build();
            hand.previewEnabled = preview;
            Camera camera = Camera.main;
            if (camera == null) { GameObject cameraObject = new GameObject("Main Camera"); cameraObject.tag = "MainCamera"; camera = cameraObject.AddComponent<Camera>(); }
            AhamSceneVisuals.Build(camera);
            targets=Object.FindObjectsByType<HapticSurface>(FindObjectsSortMode.None);
        }
        private void LateUpdate()
        {
            Camera camera=Camera.main;
            if(camera!=null){float left=Mathf.Clamp01((PanelWidth+30)/Screen.width);camera.rect=new Rect(left,0,1-left,1);}
        }
        private void Update()
        {
            if (transport == null || hand == null || Time.unscaledTime < nextCommand) return;
            nextCommand = Time.unscaledTime + .02f;
            HapticSurface selected=hand.tips[1]==null?null:hand.tips[1].Surface;
            if(targets!=null)foreach(HapticSurface target in targets)if(target!=null)target.SetContactHighlight(target==selected);
            if (preview) { System.Array.Clear(cueDuties, 0, 5); System.Array.Clear(cuePatterns, 0, 5); return; }
            GloveTelemetry data = transport.Latest;
            for (int i = 0; i < 5; i++)
            {
                bool sensorAvailable = transport.Fresh && data != null && (data.Flags & 1) != 0 && (data.SensorMask & (1 << i)) != 0;
                HapticSurface surface = sensorAvailable && hand.RootValid && hand.tips[i] != null ? hand.tips[i].Surface : null;
                cueDuties[i] = surface == null ? (byte)0 : (byte)Mathf.Clamp(surface.intensity, 0, 160);
                cuePatterns[i] = surface == null ? (byte)0 : (byte)surface.pattern;
                bool motorAvailable = data != null && (data.MotorMask & (1 << i)) != 0;
                duties[i] = motorAvailable ? cueDuties[i] : (byte)0;
                patterns[i] = motorAvailable ? cuePatterns[i] : (byte)0;
            }
            if (cueMonitor) transport.SendCueMonitor(cueDuties, cuePatterns);
            if (!hand.RootValid) transport.SendControl(0);
            else transport.SendHaptics(duties, patterns);
        }
        private void EnsureStyles()
        {
            if(titleStyle!=null)return;
            titleStyle=new GUIStyle(GUI.skin.label){fontSize=32,fontStyle=FontStyle.Bold};titleStyle.normal.textColor=new Color(.28f,.86f,.73f);
            sectionStyle=new GUIStyle(GUI.skin.label){fontSize=13,fontStyle=FontStyle.Bold};sectionStyle.normal.textColor=new Color(.6f,.7f,.75f);
            valueStyle=new GUIStyle(GUI.skin.label){fontSize=24,fontStyle=FontStyle.Bold};valueStyle.normal.textColor=Color.white;
            panelTexture=new Texture2D(1,1);panelTexture.SetPixel(0,0,new Color(.035f,.055f,.072f,.97f));panelTexture.Apply();
            panelStyle=new GUIStyle(GUI.skin.box){padding=new RectOffset(18,18,16,16)};panelStyle.normal.background=panelTexture;
        }
        private static void Meter(float value,float maximum,Color color)
        {
            Rect rect=GUILayoutUtility.GetRect(1,6,GUILayout.ExpandWidth(true));Color saved=GUI.color;
            GUI.color=new Color(.15f,.22f,.26f);GUI.DrawTexture(rect,Texture2D.whiteTexture);
            rect.width*=Mathf.Clamp01(value/maximum);GUI.color=color;GUI.DrawTexture(rect,Texture2D.whiteTexture);GUI.color=saved;
        }
        private void OnGUI()
        {
            if(transport==null||hand==null)return;EnsureStyles();
            GUILayout.BeginArea(new Rect(12,12,PanelWidth,Screen.height-24),panelStyle);
            scroll=GUILayout.BeginScrollView(scroll);
            GUILayout.Label("AHAM",titleStyle);GUILayout.Label("A hand between two worlds",sectionStyle);GUILayout.Space(12);
            bool wantPreview=GUILayout.Toggle(preview,"Software preview (no sensor)");
            if(wantPreview!=preview)
            {if(wantPreview){transport.SetOutgoing(false);outgoing=false;}preview=wantPreview;hand.previewEnabled=preview;}
            if(preview)
            {
                GUILayout.Label("Generated movement · motor commands blocked");
                hand.previewAuto=GUILayout.Toggle(hand.previewAuto,"Animate finger and wrist automatically");
                GUI.enabled=!hand.previewAuto;
                GUILayout.Label("Index bend");hand.previewIndex=GUILayout.HorizontalSlider(hand.previewIndex,0,1);
                GUILayout.Label("Wrist tilt");hand.previewPitch=GUILayout.HorizontalSlider(hand.previewPitch,-45,45);
                GUILayout.Label("Wrist roll");hand.previewRoll=GUILayout.HorizontalSlider(hand.previewRoll,-45,45);GUI.enabled=true;
            }
            else GUILayout.Label(transport.Status);
            GloveTelemetry data=transport.Latest;
            GUILayout.Space(12);GUILayout.Label("LIVE FLEX SENSOR",sectionStyle);
            if(data!=null)
            {
                GUILayout.BeginHorizontal();GUILayout.Label("Raw index: "+data.Raw[1],valueStyle);GUILayout.EndHorizontal();
                GUILayout.Label("Index bend from sensor: "+(data.Curls[1]/10f).ToString("F1")+"%");
                Meter(data.Curls[1],1000,new Color(.28f,.86f,.73f));
                GUILayout.Label("Calibrated: "+((data.Flags&1)!=0));
                if(!transport.Fresh)GUILayout.Label("Sensor data stale — reconnect USB");
                if((data.Flags&1)==0)GUILayout.Label("Capture straight and bent poses in settings below.");
            }
            else GUILayout.Label("Connect the USB bridge for real sensor values.");
            GUILayout.Space(14);GUILayout.Label("VIRTUAL CONTACT",sectionStyle);
            HapticSurface contact=hand.tips[1]==null?null:hand.tips[1].Surface;
            GUILayout.Label("Index contact: "+(contact==null?"none":contact.name));
            GUILayout.BeginHorizontal();
            if(GUILayout.Button("Smooth"))hand.desktopSide=-.075f+.0315f;
            if(GUILayout.Button("Rough"))hand.desktopSide=.0315f;
            if(GUILayout.Button("Soft"))hand.desktopSide=.075f+.0315f;
            GUILayout.EndHorizontal();
            GUILayout.Label("Desktop hand depth");hand.desktopDepth=GUILayout.HorizontalSlider(hand.desktopDepth,-.1f,.18f);
            GUILayout.Space(12);GUILayout.Label("RETURN CUE",sectionStyle);
            cueMonitor=GUILayout.Toggle(cueMonitor,"Monitor Unity cues (no motor output)");
            GUILayout.Label("Unity index cue: "+cueDuties[1]+"/255",valueStyle);
            Meter(cueDuties[1],255,new Color(.95f,.66f,.29f));
            int received=transport.ReceivedIndexCue;
            GUILayout.Label("Bridge received cue: "+(received<0?"waiting / stale":received+"/255")+" · pattern "+cuePatterns[1]);
            GUILayout.Label("Board applied index PWM: "+(data==null?"—":data.Vibration[1]+"/255"));
            if(data!=null&&data.MotorMask==0)GUILayout.Label("Physical motor output disabled");
            GUILayout.Space(12);advanced=GUILayout.Toggle(advanced,"Calibration / hardware settings");
            if(advanced)
            {
                GUI.enabled=!preview;
                bool enabled=GUILayout.Toggle(outgoing,"Enable outgoing commands");
                if(enabled!=outgoing){outgoing=enabled;transport.SetOutgoing(outgoing);}
                GUI.enabled=!preview&&outgoing&&transport.Fresh;
                GUILayout.BeginHorizontal();if(GUILayout.Button("Capture open"))transport.SendControl(2);if(GUILayout.Button("Capture closed"))transport.SendControl(3);GUILayout.EndHorizontal();
                GUILayout.BeginHorizontal();if(GUILayout.Button("Arm"))transport.SendControl(1);if(GUILayout.Button("Disarm"))transport.SendControl(0);if(GUILayout.Button("Clear fault"))transport.SendControl(4);GUILayout.EndHorizontal();GUI.enabled=true;
                if(!preview)
                {
                    hand.useImuTilt=GUILayout.Toggle(hand.useImuTilt,"Use MPU6050 for slow wrist tilt");
                    GUILayout.Label(transport.ImuFresh?"MPU6050 data connected":"MPU6050 absent / stale (optional)");
                    GUI.enabled=transport.ImuFresh;if(GUILayout.Button("Center wrist in neutral pose"))hand.CenterImu();GUI.enabled=true;
                }
                if(data!=null)GUILayout.Label("State: "+data.State+" | Fault: "+data.Fault+" | masks: "+data.SensorMask+"/"+data.MotorMask);
            }
            GUILayout.EndScrollView();GUILayout.EndArea();
        }
    }
}
