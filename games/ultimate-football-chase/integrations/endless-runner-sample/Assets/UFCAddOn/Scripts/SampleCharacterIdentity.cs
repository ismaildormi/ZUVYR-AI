using UnityEngine;

namespace UltimateFootballChase.TrashDashAddOn
{
    /// <summary>
    /// Attach to a new, independently authored humanoid prefab alongside the sample's Character component.
    /// Works on its visual renderers only: no input, track, collision, inventory or store state is changed.
    /// </summary>
    [RequireComponent(typeof(Character))]
    public sealed class SampleCharacterIdentity : MonoBehaviour
    {
        [SerializeField] private RunnerIdentityPalette palette;
        [Tooltip("Only renderers/material slots exclusively assigned to the shirt; not eyes or skin")]
        [SerializeField] private Renderer[] shirtRenderers;
        [Tooltip("Only renderers/material slots exclusively assigned to skin; not clothing")]
        [SerializeField] private Renderer[] skinRenderers;
        [Tooltip("Index 0 is 'none' (leave it empty). Other entries are original optional headwear objects.")]
        [SerializeField] private GameObject[] headwear = new GameObject[5];
        [SerializeField] private int shirtIndex;
        [SerializeField] private int complexionIndex = 1;
        [SerializeField] private int headwearIndex;

        private static readonly int BaseColor = Shader.PropertyToID("_BaseColor");
        private static readonly int LegacyColor = Shader.PropertyToID("_Color");
        private MaterialPropertyBlock block;

        public RunnerIdentityPalette Palette => palette;
        public int ShirtIndex => shirtIndex;
        public int ComplexionIndex => complexionIndex;
        public int HeadwearIndex => headwearIndex;

        private void OnEnable() => Apply();

        /// <summary>Called by an independently implemented wardrobe UI; indexes are preview-only, not entitlements.</summary>
        public void SelectStyle(int shirt, int complexion, int hat)
        {
            shirtIndex = palette == null || palette.ShirtCount == 0 ? 0 : Mathf.Clamp(shirt, 0, palette.ShirtCount - 1);
            complexionIndex = palette == null || palette.ComplexionCount == 0 ? 0 :
                Mathf.Clamp(complexion, 0, palette.ComplexionCount - 1);
            headwearIndex = headwear == null || headwear.Length == 0 ? 0 : Mathf.Clamp(hat, 0, headwear.Length - 1);
            Apply();
        }

        public void Apply()
        {
            if (palette == null) return; // no profile assigned: preserve the authored prefab unchanged
            Tint(shirtRenderers, palette.ShirtAt(shirtIndex));
            Tint(skinRenderers, palette.ComplexionAt(complexionIndex));
            if (headwear == null) return;
            for (int i = 1; i < headwear.Length; ++i)
                if (headwear[i] != null) headwear[i].SetActive(i == headwearIndex);
        }

        private void Tint(Renderer[] renderers, Color colour)
        {
            if (renderers == null) return;
            if (block == null) block = new MaterialPropertyBlock();
            foreach (Renderer part in renderers)
            {
                if (part == null) continue;
                Material[] materials = part.sharedMaterials;
                for (int i = 0; i < materials.Length; ++i)
                {
                    Material material = materials[i];
                    if (material == null) continue;
                    int property = material.HasProperty(BaseColor) ? BaseColor :
                        material.HasProperty(LegacyColor) ? LegacyColor : -1;
                    if (property < 0) continue;
                    part.GetPropertyBlock(block, i);
                    block.SetColor(property, colour);
                    part.SetPropertyBlock(block, i);
                    block.Clear();
                }
            }
        }
    }
}
