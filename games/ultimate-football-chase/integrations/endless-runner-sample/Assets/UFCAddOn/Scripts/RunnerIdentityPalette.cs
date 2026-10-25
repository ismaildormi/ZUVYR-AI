using UnityEngine;

namespace UltimateFootballChase.TrashDashAddOn
{
    /// <summary>Original visual-only data for a character prefab in the owner's local sample installation.</summary>
    [CreateAssetMenu(fileName = "RunnerIdentityPalette", menuName = "Football Chase Add-On/Runner Identity Palette")]
    public sealed class RunnerIdentityPalette : ScriptableObject
    {
        [SerializeField] private Color[] shirtColours =
        {
            new Color(.12f, .58f, .66f), new Color(.96f, .64f, .18f),
            new Color(.62f, .34f, .76f), new Color(.86f, .36f, .40f)
        };
        [SerializeField] private Color[] complexionColours =
        {
            new Color(1f, .85f, .68f), new Color(.91f, .66f, .47f),
            new Color(.73f, .46f, .29f), new Color(.48f, .29f, .20f),
            new Color(.29f, .17f, .13f)
        };

        public int ShirtCount => shirtColours == null ? 0 : shirtColours.Length;
        public int ComplexionCount => complexionColours == null ? 0 : complexionColours.Length;
        public Color ShirtAt(int index) => ShirtCount == 0 ? Color.white : shirtColours[Mathf.Clamp(index, 0, ShirtCount - 1)];
        public Color ComplexionAt(int index) => ComplexionCount == 0 ? Color.white :
            complexionColours[Mathf.Clamp(index, 0, ComplexionCount - 1)];
    }
}
