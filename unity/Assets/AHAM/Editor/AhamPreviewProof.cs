#if UNITY_EDITOR
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using System.IO;

namespace Aham
{
    public static class AhamPreviewProof
    {
        public static void Render()
        {
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            GameObject root = new GameObject("Preview Hand"); root.transform.position = new Vector3(0, 1, 0);
            AhamHandRig hand = root.AddComponent<AhamHandRig>(); hand.Build();
            Camera camera = new GameObject("Proof Camera").AddComponent<Camera>();
            AhamSceneVisuals.Build(camera);
            string directory = System.Environment.GetEnvironmentVariable("AHAM_PROOF_DIR");
            if (string.IsNullOrEmpty(directory)) directory = Path.Combine(Directory.GetCurrentDirectory(), "PreviewProof");
            Directory.CreateDirectory(directory);
            hand.ApplyPreview(0, 0, 0); Save(camera, Path.Combine(directory, "index-open.png"));
            hand.ApplyPreview(1, 0, 0); Save(camera, Path.Combine(directory, "index-bent.png"));
            hand.ApplyPreview(.6f, 20, 25); Save(camera, Path.Combine(directory, "wrist-tilted.png"));
            VerifyTargets(hand);
            hand.desktopSide=.0315f;hand.ApplyPreview(.5f,0,0);Save(camera,Path.Combine(directory,"index-contact.png"));
            Debug.Log("AHAM preview proof saved to " + directory);
        }
        private static void VerifyTargets(AhamHandRig hand)
        {
            string[] names={"Smooth","Rough","Soft"};float[] x={-.075f,0,.075f};
            for(int i=0;i<names.Length;i++)
            {
                hand.desktopSide=x[i]+.0315f;hand.ApplyPreview(.5f,0,0);Physics.SyncTransforms();
                SphereCollider tip=hand.tips[1].GetComponent<SphereCollider>();bool hit=false;
                foreach(Collider collider in Physics.OverlapSphere(tip.transform.position,tip.radius,~0,QueryTriggerInteraction.Ignore))
                {HapticSurface surface=collider.GetComponent<HapticSurface>();if(surface!=null&&surface.name==names[i])hit=true;}
                if(!hit)throw new System.InvalidOperationException("Index cannot reach "+names[i]);
                Debug.Log("CONTACT GEOMETRY PASS: "+names[i]);
            }
            hand.desktopSide=.0315f;hand.ApplyPreview(0,0,0);Physics.SyncTransforms();
            SphereCollider openTip=hand.tips[1].GetComponent<SphereCollider>();
            foreach(Collider collider in Physics.OverlapSphere(openTip.transform.position,openTip.radius,~0,QueryTriggerInteraction.Ignore))
                if(collider.GetComponent<HapticSurface>()!=null)throw new System.InvalidOperationException("Open index unexpectedly touches a target");
            Debug.Log("CONTACT GEOMETRY PASS: open finger has no contact");
        }
        private static void Save(Camera camera, string path)
        {
            RenderTexture target = new RenderTexture(1000, 700, 24); target.antiAliasing=4;camera.targetTexture = target;
            camera.Render(); RenderTexture.active = target;
            Texture2D pixels = new Texture2D(1000, 700, TextureFormat.RGB24, false);
            pixels.ReadPixels(new Rect(0, 0, 1000, 700), 0, 0); pixels.Apply(); File.WriteAllBytes(path, pixels.EncodeToPNG());
            RenderTexture.active = null; camera.targetTexture = null; Object.DestroyImmediate(pixels); Object.DestroyImmediate(target);
        }
    }
}
#endif
