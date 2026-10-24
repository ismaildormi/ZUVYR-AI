using UnityEngine;

namespace UltimateFootballChase.Hub
{
    [CreateAssetMenu(fileName = "HubConfig", menuName = "Ultimate Football Chase/Hub Config")]
    public sealed class HubConfig : ScriptableObject
    {
        [Header("Provisional distances/speed; PDF names and unlock count are exact")]
        [Min(1f)] public float WalkingSpeed = 5f;
        [Min(1f)] public float InteractionRadius = 4f;
        [Min(.1f)] public float LocalPositionSaveIntervalSeconds = .5f;
        [Min(.1f)] public float PracticeJumpSeconds = .8f;
        [Min(.1f)] public float PracticeJumpHeight = 1.4f;
        [Min(.1f)] public float PracticeSlideSeconds = .8f;
        [Range(2, 3)] public int SeasonCycleMonths = 3; // PDF: change decor every 2–3 months
    }
}
