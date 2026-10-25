using UnityEngine;
using UltimateFootballChase.Characters;

namespace UltimateFootballChase.Visuals
{
    /// <summary>Optional component on an independently cleared humanoid prefab. Assign only the intended mesh slots.</summary>
    public sealed class AvatarAppearanceSlots : MonoBehaviour
    {
        public Renderer[] KitRenderers;
        public Renderer[] SkinRenderers;
        public GameObject Cap;
        public GameObject Band;
        public GameObject Visor;
        public GameObject Crest;
        private static readonly int BaseColorId = Shader.PropertyToID("_BaseColor");
        private static readonly int ColorId = Shader.PropertyToID("_Color");

        private static void Tint(Renderer part, Color tint)
        {
            if (part == null) return;
            Material material = part.material; // instance-local; do not recolour a shared prefab asset
            if (material.HasProperty(BaseColorId)) material.SetColor(BaseColorId, tint);
            else if (material.HasProperty(ColorId)) material.SetColor(ColorId, tint);
        }

        public void Apply(Color outfit, string tone, string headwear)
        {
            if (KitRenderers != null)
                foreach (Renderer part in KitRenderers) Tint(part, outfit);
            if (SkinRenderers != null)
                foreach (Renderer part in SkinRenderers) Tint(part, OriginalRoster.SkinToneColor(tone));
            if (!OriginalRoster.HasHeadwear(headwear)) headwear = "none";
            if (Cap != null) Cap.SetActive(headwear == "cap");
            if (Band != null) Band.SetActive(headwear == "band");
            if (Visor != null) Visor.SetActive(headwear == "visor");
            if (Crest != null) Crest.SetActive(headwear == "crest");
        }
    }
}
