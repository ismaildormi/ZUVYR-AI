using UnityEngine;

namespace UltimateFootballChase.Core
{
    /// <summary>Phase-1 tuning. Unspecified values are explicitly provisional; see docs/DECISIONS.md.</summary>
    [CreateAssetMenu(fileName = "RunConfig", menuName = "Ultimate Football Chase/Run Config")]
    public sealed class RunConfig : ScriptableObject
    {
        [Header("Confirmed by owner")]
        [Min(0.1f)] public float StartingSpeedMetersPerSecond = 9f;
        [Min(0f)] public float ReviveInvulnerabilitySeconds = 2f;
        [Min(0f)] public float MinimumReplayBeforeSkipSeconds = 1f;
        [Min(1)] public int MaximumKeysPerRevive = 3;

        [Header("Provisional greybox tuning — review with device playtest")]
        [Min(1f)] public float LaneWidth = 2.7f;
        [Min(0.01f)] public float LaneChangeSeconds = .18f;
        [Min(.1f)] public float JumpSeconds = .85f;
        [Min(.1f)] public float JumpHeight = 1.9f;
        [Min(.1f)] public float SlideSeconds = .9f;
        [Min(.1f)] public float StumbleSeconds = .5f;
        [Min(.1f)] public float ChaserNearSeconds = 6f;
        [Min(1f)] public float FirstObstacleMeters = 35f;
        [Min(.5f)] public float ReplayHistorySeconds = 3f;
        [Range(.1f, 1f)] public float ReplayPlaybackSpeed = .3f;
        [Min(0)] public int TestOnlyStartingKeys = 3;

        private void OnValidate()
        {
            LaneWidth = Mathf.Max(1f, LaneWidth);
            LaneChangeSeconds = Mathf.Max(.01f, LaneChangeSeconds);
            JumpSeconds = Mathf.Max(.1f, JumpSeconds);
            JumpHeight = Mathf.Max(.1f, JumpHeight);
            SlideSeconds = Mathf.Max(.1f, SlideSeconds);
        }
    }
}
