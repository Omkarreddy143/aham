using System.Collections.Generic;
using UnityEngine;

namespace Aham
{
    public sealed class FingertipContact : MonoBehaviour
    {
        private readonly HashSet<HapticSurface> touching = new HashSet<HapticSurface>();
        private HapticSurface recent;
        private float releasedAt;
        public HapticSurface Surface
        {
            get
            {
                HapticSurface selected = null;
                foreach (HapticSurface candidate in touching)
                    if (candidate != null && candidate.isActiveAndEnabled && (selected == null || candidate.priority > selected.priority)) selected = candidate;
                if (selected != null) { recent = selected; return selected; }
                return recent != null && recent.isActiveAndEnabled && Time.unscaledTime - releasedAt < .05f ? recent : null;
            }
        }
        private void OnTriggerEnter(Collider other) { HapticSurface surface = other.GetComponent<HapticSurface>(); if (surface != null) touching.Add(surface); }
        private void OnTriggerExit(Collider other) { HapticSurface surface = other.GetComponent<HapticSurface>(); if (surface != null) touching.Remove(surface); releasedAt = Time.unscaledTime; }
        private void OnDisable() { touching.Clear(); recent = null; }
    }
}
