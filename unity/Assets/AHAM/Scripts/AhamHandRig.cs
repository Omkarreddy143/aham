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
        public readonly FingertipContact[] tips = new FingertipContact[5];
        private readonly Transform[,] joints = new Transform[5, 3];
        private Vector3 desktopOrigin;
        private bool externalTrackingValid;
        public bool RootValid { get { return !requireTrackedRoot || (trackedRoot != null && externalTrackingValid); } }
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
            Object.Destroy(cube.GetComponent<Collider>());
            Renderer renderer = cube.GetComponent<Renderer>(); renderer.material.color = color;
            return cube;
        }
        private void Update()
        {
            if (trackedRoot != null && externalTrackingValid)
            {
                transform.position = trackedRoot.TransformPoint(trackerPositionOffset);
                transform.rotation = trackedRoot.rotation * Quaternion.Euler(trackerRotationOffset);
            }
            else if (!requireTrackedRoot) transform.position = desktopOrigin + Vector3.forward * desktopDepth;
            GloveTelemetry data = transport == null ? null : transport.Latest;
            if (data == null || !transport.Fresh) return;
            for (int i = 0; i < 5; i++) for (int j = 0; j < 3; j++)
                if (joints[i, j] != null) joints[i, j].localRotation = Quaternion.Euler(((data.SensorMask & (1 << i)) != 0 ? data.Curls[i] : 0) / 1000f * (j == 0 ? 55 : 65), 0, 0);
        }
    }
}
