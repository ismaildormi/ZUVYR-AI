using UnityEngine;

namespace UltimateFootballChase.PowerUps
{
    /// <summary>Only hoverboard duration is specified by the PDF. Other values are provisional playtest settings.</summary>
    [CreateAssetMenu(fileName = "PowerUpConfig", menuName = "Ultimate Football Chase/Power-ups")]
    public sealed class PowerUpConfig : ScriptableObject
    {
        [Header("PDF section 7 — confirmed")]
        public const float HoverboardProtectionSeconds = 30f;

        [Header("Provisional greybox tuning, NOT PDF-prescribed figures")]
        [Min(.1f)] public float MagnetSeconds = 12f;
        [Min(.1f)] public float SuperShoesSeconds = 10f;
        [Min(.1f)] public float JetpackSeconds = 8f;
        [Min(.1f)] public float MagnetRangeMetres = 3.4f;
        [Min(.1f)] public float MagnetAheadMetres = 6f;
        [Min(1f)] public float SuperShoesHeightMultiplier = 2f;
        [Min(.1f)] public float JetpackFlightHeightMetres = 3.2f;
        [Min(.1f)] public float JetpackLandingGraceSeconds = .8f;
        [Range(.15f, .6f)] public float DoubleTapWindowSeconds = .35f;
        [Min(1)] public int PickupEveryRows = 4;
        [Min(0)] public int TestOnlyStartingBoards = 1;
    }
}
