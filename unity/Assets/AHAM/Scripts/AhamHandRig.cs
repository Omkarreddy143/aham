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
        public bool previewEnabled;
        public bool previewAuto = true;
        public float previewIndex, previewPitch, previewRoll;
        public bool useImuTilt;
        private float neutralRoll, neutralPitch, smoothRoll, smoothPitch;
        private bool tiltValid;
        public readonly FingertipContact[] tips = new FingertipContact[5];
        private readonly Transform[,] joints = new Transform[5, 3];
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
            Cube("Palm", transform, Vector3.zero, new Vector3(.2f, .035f, .14f), new Color(.18f, .5f, .48f));
            string[] names = { "Thumb", "Index", "Middle", "Ring", "Little" };
            float[] lengths = { .035f, .028f, .023f };
            for (int i = 0; i < 5; i++)
            {
                Transform parent = transform;
                for (int j = 0; j < 3; j++)
                {
                    GameObject pivot = new GameObject(names[i] + "Joint" + j); pivot.transform.SetParent(parent, false);
                    pivot.transform.localPosition = j == 0 ? new Vector3((i - 2) * .038f, 0, .062f) : new Vector3(0, 0, lengths[j - 1]);
                    joints[i, j] = pivot.transform;
                    Cube("Segment", pivot.transform, new Vector3(0, 0, lengths[j] / 2), new Vector3(.022f, .023f, lengths[j]), new Color(.35f, .65f, .62f));
                    parent = pivot.transform;
                }
                GameObject tip = new GameObject(names[i] + "Tip"); tip.transform.SetParent(parent, false); tip.transform.localPosition = new Vector3(0, 0, lengths[2]);
                SphereCollider collider = tip.AddComponent<SphereCollider>(); collider.radius = .014f; collider.isTrigger = true;
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
            else if (!requireTrackedRoot) transform.position = desktopOrigin + Vector3.forward * desktopDepth;
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
                if (joints[i, j] != null) joints[i, j].localRotation = Quaternion.Euler(((data.SensorMask & (1 << i)) != 0 ? data.Curls[i] : 0) / 1000f * (j == 0 ? 55 : 65), 0, 0);
        }
        public void ApplyPreview(float index, float pitch, float roll)
        {
            transform.position = desktopOrigin + Vector3.forward * desktopDepth;
            transform.rotation = Quaternion.Euler(pitch, 0, roll);
            for (int i = 0; i < 5; i++) for (int j = 0; j < 3; j++)
                if (joints[i, j] != null) joints[i, j].localRotation = Quaternion.Euler(i == 1 ? Mathf.Clamp01(index) * (j == 0 ? 55 : 65) : 0, 0, 0);
        }
    }
}
