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
            camera.transform.position = new Vector3(.24f, 1.18f, .36f); camera.transform.LookAt(new Vector3(0, .97f, .08f));
            camera.clearFlags = CameraClearFlags.SolidColor; camera.backgroundColor = new Color(.06f, .09f, .14f);
            Light light = new GameObject("Light").AddComponent<Light>(); light.type = LightType.Directional; light.intensity = 1.2f; light.transform.rotation = Quaternion.Euler(50, -30, 0);
            string directory = System.Environment.GetEnvironmentVariable("AHAM_PROOF_DIR");
            if (string.IsNullOrEmpty(directory)) directory = Path.Combine(Directory.GetCurrentDirectory(), "PreviewProof");
            Directory.CreateDirectory(directory);
            hand.ApplyPreview(0, 0, 0); Save(camera, Path.Combine(directory, "index-open.png"));
            hand.ApplyPreview(1, 0, 0); Save(camera, Path.Combine(directory, "index-bent.png"));
            hand.ApplyPreview(.6f, 20, 25); Save(camera, Path.Combine(directory, "wrist-tilted.png"));
            Debug.Log("AHAM preview proof saved to " + directory);
        }
        private static void Save(Camera camera, string path)
        {
            RenderTexture target = new RenderTexture(1000, 700, 24); camera.targetTexture = target;
            camera.Render(); RenderTexture.active = target;
            Texture2D pixels = new Texture2D(1000, 700, TextureFormat.RGB24, false);
            pixels.ReadPixels(new Rect(0, 0, 1000, 700), 0, 0); pixels.Apply(); File.WriteAllBytes(path, pixels.EncodeToPNG());
            RenderTexture.active = null; camera.targetTexture = null; Object.DestroyImmediate(pixels); Object.DestroyImmediate(target);
        }
    }
}
#endif
