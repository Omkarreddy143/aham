using UnityEngine;

namespace Aham
{
    public sealed class HapticSurface : MonoBehaviour
    {
        [Range(0, 160)] public int intensity = 100;
        [Range(0, 3)] public int pattern = 1;
        public int priority;
        private Renderer targetRenderer;
        private MaterialPropertyBlock highlight;
        private Color baseColor;
        public void SetContactHighlight(bool active)
        {
            if(targetRenderer==null){targetRenderer=GetComponent<Renderer>();if(targetRenderer==null)return;baseColor=targetRenderer.sharedMaterial.color;highlight=new MaterialPropertyBlock();}
            highlight.SetColor("_Color",active?Color.Lerp(baseColor,Color.white,.18f):baseColor);
            highlight.SetColor("_EmissionColor",active?baseColor*.35f:Color.black);targetRenderer.SetPropertyBlock(highlight);
        }
    }
}
