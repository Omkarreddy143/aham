using UnityEngine;
using UnityEngine.Rendering;

namespace Aham
{
    public static class AhamSceneVisuals
    {
        public static void Build(Camera camera)
        {
            camera.transform.position = new Vector3(.24f,1.24f,.38f);
            camera.transform.LookAt(new Vector3(.01f,.97f,.025f)); camera.fieldOfView=35;
            camera.nearClipPlane=.01f;camera.farClipPlane=20;
            camera.clearFlags=CameraClearFlags.SolidColor;camera.backgroundColor=new Color(.12f,.16f,.19f);
            RenderSettings.ambientMode=AmbientMode.Flat;RenderSettings.ambientLight=new Color(.38f,.41f,.46f);
            QualitySettings.shadows=ShadowQuality.All;QualitySettings.shadowResolution=ShadowResolution.High;QualitySettings.shadowDistance=5;
            QualitySettings.antiAliasing=4;
            Light key=new GameObject("Studio key light").AddComponent<Light>();key.type=LightType.Directional;key.intensity=1.5f;
            key.color=new Color(1,.91f,.8f);key.transform.rotation=Quaternion.Euler(45,-35,0);key.shadows=LightShadows.Soft;key.shadowBias=.025f;
            Light fill=new GameObject("Cool fill light").AddComponent<Light>();fill.type=LightType.Directional;fill.intensity=.55f;
            fill.color=new Color(.64f,.8f,1);fill.transform.rotation=Quaternion.Euler(25,140,0);
            Material table=AhamAppearance.Material(new Color(.23f,.29f,.31f),.05f,.3f);
            Material edge=AhamAppearance.Material(new Color(.055f,.075f,.085f),.3f,.38f);
            Material inset=AhamAppearance.Material(new Color(.11f,.17f,.19f),0,.16f);
            AhamAppearance.RoundedBox("Lab desk",null,new Vector3(0,.863f,.03f),new Vector3(.65f,.045f,.52f),.012f,table);
            AhamAppearance.RoundedBox("Desk edge",null,new Vector3(0,.835f,.03f),new Vector3(.65f,.012f,.52f),.004f,edge);
            AhamAppearance.RoundedBox("Interaction mat",null,new Vector3(0,.889f,.08f),new Vector3(.285f,.006f,.24f),.0025f,inset);
            CreateTarget("Smooth",-.075f,new Color(.42f,.61f,.70f),100,1,3,.8f,.75f);
            CreateTarget("Rough",0,new Color(.65f,.40f,.22f),150,2,2,.05f,.12f);
            CreateTarget("Soft",.075f,new Color(.17f,.47f,.38f),80,3,1,0,.2f);
        }
        private static void CreateTarget(string name,float x,Color color,int duty,int pattern,int priority,float metallic,float smoothness)
        {
            Material material=AhamAppearance.Material(color,metallic,smoothness);
            material.EnableKeyword("_EMISSION");material.SetColor("_EmissionColor",Color.black);
            if(name=="Rough")
            {
                Texture2D texture=new Texture2D(128,128);texture.name="Procedural rough finish";
                for(int y=0;y<128;y++)for(int column=0;column<128;column++)
                { float grain=.72f+Mathf.PerlinNoise(column*.65f,y*.65f)*.5f;texture.SetPixel(column,y,new Color(grain,grain,grain)); }
                texture.Apply();material.mainTexture=texture;material.mainTextureScale=new Vector2(3,3);
            }
            Vector3 size=new Vector3(.056f,.054f,.075f);
            GameObject target=AhamAppearance.RoundedBox(name,null,new Vector3(x,.921f,.085f),size,name=="Soft"?.012f:.004f,material);
            BoxCollider collider=target.AddComponent<BoxCollider>();collider.size=size;
            HapticSurface haptic=target.AddComponent<HapticSurface>();haptic.intensity=duty;haptic.pattern=pattern;haptic.priority=priority;
            AhamAppearance.RoundedBox(name+" plinth",null,new Vector3(x,.896f,.085f),new Vector3(.065f,.008f,.084f),.003f,AhamAppearance.Material(new Color(.07f,.10f,.12f),.5f,.45f));
            Material marker=AhamAppearance.Material(color,.1f,.5f);marker.EnableKeyword("_EMISSION");marker.SetColor("_EmissionColor",color*.4f);
            AhamAppearance.RoundedBox(name+" marker",null,new Vector3(x,.899f,.139f),new Vector3(.039f,.003f,.004f),.001f,marker);
        }
    }
}
