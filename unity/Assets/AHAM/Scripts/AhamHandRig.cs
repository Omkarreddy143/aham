using UnityEngine;

namespace Aham
{
    public sealed class AhamHandRig : MonoBehaviour
    {
        public AhamTransport transport;
        public Transform trackedRoot;
        public bool requireTrackedRoot;
        public Vector3 trackerPositionOffset;
        public Vector3 trackerRotationOffset;
        public float desktopDepth;
        public float desktopSide = .0315f;
        public bool previewEnabled;
        public bool previewAuto = true;
        public float previewIndex, previewPitch, previewRoll;
        public bool useImuTilt;
        private float neutralRoll, neutralPitch, smoothRoll, smoothPitch;
        private bool tiltValid;
        public readonly FingertipContact[] tips = new FingertipContact[5];
        private readonly Transform[,] joints = new Transform[5, 3];
        private readonly Quaternion[,] restRotations = new Quaternion[5, 3];
        private Vector3 desktopOrigin;
        private bool externalTrackingValid;
        public bool RootValid { get { return requireTrackedRoot ? trackedRoot != null && externalTrackingValid : !useImuTilt || tiltValid; } }
        public bool CenterImu()
        {
            if (transport == null || !transport.ImuFresh || !ImuTilt.TryAngles(transport.LatestImu, out neutralRoll, out neutralPitch)) return false;
            smoothRoll = smoothPitch = 0; return true;
        }
        public void SetTrackingValidity(bool valid) { externalTrackingValid = valid; }
        public void Build()
        {
            desktopOrigin = transform.position;
            Material skin = AhamAppearance.Material(new Color(.68f,.43f,.29f), 0, .18f);
            Material nail = AhamAppearance.Material(new Color(.84f,.66f,.54f), 0, .48f);
            Material fabric = AhamAppearance.Material(new Color(.035f,.065f,.073f), 0, .18f);
            Material accent = AhamAppearance.Material(new Color(.06f,.61f,.49f), .25f, .45f);
            AhamAppearance.Palm(transform, skin);
            AhamAppearance.RoundedBox("Wrist cuff",transform,new Vector3(0,0,-.079f),new Vector3(.058f,.031f,.032f),.008f,fabric);
            AhamAppearance.RoundedBox("Cuff accent",transform,new Vector3(0,.015f,-.080f),new Vector3(.038f,.003f,.010f),.001f,accent);
            string[] names = { "Thumb", "Index", "Middle", "Ring", "Little" };
            float[,] lengths = {{.029f,.022f,.016f},{.035f,.025f,.019f},{.040f,.028f,.020f},{.037f,.026f,.019f},{.029f,.022f,.017f}};
            float[] widths = {.019f,.017f,.018f,.017f,.015f};
            for (int i = 0; i < 5; i++)
            {
                Transform parent = transform;
                for (int j = 0; j < 3; j++)
                {
                    GameObject pivot = new GameObject(names[i] + "Joint" + j); pivot.transform.SetParent(parent, false);
                    pivot.transform.localPosition = j == 0 ? (i == 0 ? new Vector3(-.041f,-.002f,-.027f) : new Vector3((i-2.5f)*.021f,0,.034f + (i==2 ? .006f : 0))) : new Vector3(0,0,lengths[i,j-1]);
                    restRotations[i,j] = j==0 && i==0 ? Quaternion.Euler(0,-55,0) : Quaternion.identity;
                    pivot.transform.localRotation = restRotations[i,j];
                    joints[i, j] = pivot.transform;
                    float width=widths[i]*(1-j*.09f);
                    GameObject segment=AhamAppearance.Shape(PrimitiveType.Capsule,"Phalanx",pivot.transform,new Vector3(0,0,lengths[i,j]/2),new Vector3(width,lengths[i,j]/2+width*.18f,width),skin);
                    segment.transform.localRotation=Quaternion.Euler(90,0,0);
                    AhamAppearance.Shape(PrimitiveType.Sphere,"Knuckle",pivot.transform,Vector3.zero,Vector3.one*width*.98f,skin);
                    if(j==2) AhamAppearance.Shape(PrimitiveType.Sphere,"Nail",pivot.transform,new Vector3(0,width*.43f,lengths[i,j]*.6f),new Vector3(width*.65f,.002f,lengths[i,j]*.62f),nail);
                    if(i==1 && j==0) AhamAppearance.RoundedBox("Index flex strip",pivot.transform,new Vector3(0,width*.5f,lengths[i,j]*.5f),new Vector3(.004f,.0015f,lengths[i,j]*.85f),.0006f,fabric);
                    parent = pivot.transform;
                }
                GameObject tip = new GameObject(names[i] + "Tip"); tip.transform.SetParent(parent, false); tip.transform.localPosition = new Vector3(0, 0, lengths[i,2]);
                SphereCollider collider = tip.AddComponent<SphereCollider>(); collider.radius = widths[i]*.5f; collider.isTrigger = true;
                Rigidbody body = tip.AddComponent<Rigidbody>(); body.isKinematic = true; body.useGravity = false;
                tips[i] = tip.AddComponent<FingertipContact>();
            }
        }
        public static GameObject Cube(string name, Transform parent, Vector3 position, Vector3 scale, Color color)
        {
            GameObject cube = GameObject.CreatePrimitive(PrimitiveType.Cube); cube.name = name; cube.transform.SetParent(parent, false); cube.transform.localPosition = position; cube.transform.localScale = scale;
            if (Application.isPlaying) Object.Destroy(cube.GetComponent<Collider>());
            else Object.DestroyImmediate(cube.GetComponent<Collider>());
            Renderer renderer = cube.GetComponent<Renderer>(); renderer.material.color = color;
            return cube;
        }
        private void Update()
        {
            if (previewEnabled)
            {
                float t = Time.unscaledTime;
                ApplyPreview(previewAuto ? (1 + Mathf.Sin(t * 1.5f)) / 2 : previewIndex,
                    previewAuto ? Mathf.Sin(t * .6f) * 15 : previewPitch,
                    previewAuto ? Mathf.Sin(t * .8f) * 20 : previewRoll);
                return;
            }
            if (trackedRoot != null && externalTrackingValid)
            {
                transform.position = trackedRoot.TransformPoint(trackerPositionOffset);
                transform.rotation = trackedRoot.rotation * Quaternion.Euler(trackerRotationOffset);
            }
            else if (!requireTrackedRoot) transform.position = desktopOrigin + Vector3.forward * desktopDepth + Vector3.right * desktopSide;
            if (!requireTrackedRoot && trackedRoot == null) transform.rotation = Quaternion.identity;
            tiltValid = false;
            if (!requireTrackedRoot && useImuTilt && transport != null && transport.ImuFresh)
            {
                float roll, pitch;
                if (ImuTilt.TryAngles(transport.LatestImu, out roll, out pitch))
                {
                    tiltValid = true;
                    float alpha = 1 - Mathf.Exp(-Time.unscaledDeltaTime * 12);
                    smoothRoll = Mathf.LerpAngle(smoothRoll, Mathf.DeltaAngle(neutralRoll, roll), alpha);
                    smoothPitch = Mathf.LerpAngle(smoothPitch, Mathf.DeltaAngle(neutralPitch, pitch), alpha);
                    transform.rotation = Quaternion.Euler(Mathf.Clamp(smoothPitch, -60, 60), 0, Mathf.Clamp(smoothRoll, -60, 60));
                }
            }
            GloveTelemetry data = transport == null ? null : transport.Latest;
            if (data == null || !transport.Fresh) return;
            for (int i = 0; i < 5; i++) for (int j = 0; j < 3; j++)
                if (joints[i, j] != null) joints[i, j].localRotation = restRotations[i,j] * Quaternion.Euler(((data.SensorMask & (1 << i)) != 0 ? data.Curls[i] : 0) / 1000f * (j == 0 ? 55 : j == 1 ? 70 : 45), 0, 0);
        }
        public void ApplyPreview(float index, float pitch, float roll)
        {
            transform.position = desktopOrigin + Vector3.forward * desktopDepth + Vector3.right * desktopSide;
            transform.rotation = Quaternion.Euler(pitch, 0, roll);
            for (int i = 0; i < 5; i++) for (int j = 0; j < 3; j++)
                if (joints[i, j] != null) joints[i, j].localRotation = restRotations[i,j] * Quaternion.Euler(i == 1 ? Mathf.Clamp01(index) * (j == 0 ? 55 : j == 1 ? 70 : 45) : 0, 0, 0);
        }
    }
}
