using UnityEngine;

namespace Aham
{
    public sealed class HapticSurface : MonoBehaviour
    {
        [Range(0, 160)] public int intensity = 100;
        [Range(0, 3)] public int pattern = 1;
        public int priority;
    }
}
