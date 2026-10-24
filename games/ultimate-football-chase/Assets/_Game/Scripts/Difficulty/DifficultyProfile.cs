using System;
using UnityEngine;

namespace UltimateFootballChase.Difficulty
{
    /// <summary>
    /// PDF section 4: exactly +3% for each completed 100m, capped at 2000m.
    /// Hazard tiers are 0–250, 250–750, 750–1500, 1500+ metres.
    /// Only spawn-rate endpoints are estimates because the PDF gives no numeric rates.
    /// </summary>
    [CreateAssetMenu(fileName = "DifficultyProfile", menuName = "Ultimate Football Chase/Difficulty Profile")]
    public sealed class DifficultyProfile : ScriptableObject
    {
        public const float SpeedStepMetres = 100f;
        public const double SpeedStepMultiplier = 1.03;
        public const float SpeedCapMetres = 2000f;
        public const float FirstTierEnd = 250f;
        public const float SecondTierEnd = 750f;
        public const float ThirdTierEnd = 1500f;

        [Header("Estimated spacing: not specified numerically in PDF")]
        [Min(10f)] public float StartingMetresPerObstacleRow = 28f;
        [Min(10f)] public float MaximumDensityMetresPerObstacleRow = 21f;

        public float SpeedAt(float distanceMetres, float initialSpeedMetresPerSecond)
        {
            int completedSteps = Mathf.FloorToInt(Mathf.Clamp(distanceMetres, 0f, SpeedCapMetres) / SpeedStepMetres);
            return initialSpeedMetresPerSecond * (float)Math.Pow(SpeedStepMultiplier, completedSteps);
        }
        public int TierAt(float distanceMetres)
        {
            if (distanceMetres < FirstTierEnd) return 0;
            if (distanceMetres < SecondTierEnd) return 1;
            if (distanceMetres < ThirdTierEnd) return 2;
            return 3;
        }
        public float SpawnRateAt(float distanceMetres)
        {
            // Linear increase in *rate* (rows/metre), not a linear decrease in spacing.
            float start = 1f / Mathf.Max(10f, StartingMetresPerObstacleRow);
            float cap = 1f / Mathf.Max(10f, MaximumDensityMetresPerObstacleRow);
            return Mathf.Lerp(start, cap, Mathf.Clamp01(distanceMetres / SpeedCapMetres));
        }
        public float SpacingAt(float distanceMetres) => 1f / SpawnRateAt(distanceMetres);

        private void OnValidate()
        {
            StartingMetresPerObstacleRow = Mathf.Max(10f, StartingMetresPerObstacleRow);
            MaximumDensityMetresPerObstacleRow = Mathf.Clamp(MaximumDensityMetresPerObstacleRow,
                10f, StartingMetresPerObstacleRow);
        }
    }
}
