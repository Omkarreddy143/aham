#if UNITY_EDITOR
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using System.IO;

namespace Aham
{
    public static class AhamSetup
    {
        [MenuItem("AHAM/Create Desktop Starter Scene")]
        public static void Create()
        {
            if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            GameObject demo = new GameObject("AHAM Desktop Starter"); demo.AddComponent<AhamDemo>();
            Directory.CreateDirectory("Assets/AHAM/Scenes");
            EditorSceneManager.SaveScene(UnityEngine.SceneManagement.SceneManager.GetActiveScene(), "Assets/AHAM/Scenes/AhamStarter.unity");
            AssetDatabase.Refresh(); Selection.activeGameObject = demo;
        }
    }
}
#endif
