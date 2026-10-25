using System;
using UnityEngine;
using UnityEngine.Events;

namespace VELOX.Core
{
    /// <summary>
    /// Cross-system event bus. Create one instance as a scene-persistent asset
    /// (or wire it inside the <see cref="GameDirector"/>) so loosely-coupled
    /// systems can communicate without direct references.
    /// </summary>
    [Serializable]
    public class GameEvents : ScriptableObject
    {
        // ---- Run lifecycle ----
        public UnityEvent onGameBoot;
        public UnityEvent onRunStarted;
        public UnityEvent onRunEnded;
        public UnityEvent onPlayerDied;
        public UnityEvent onPlayerRespawned;

        // ---- Runtime stats ----
        public IntEvent onScoreChanged;
        public IntEvent onBestScoreChanged;
        public IntEvent onSpeedChanged;
        public UnityEvent onPauseChanged;

        // ---- Identity / backend ----
        public StringEvent onProfileChanged;
        public StringEvent onAuthError;
        public UnityEvent onLoginChanged;

        // ---- Leaderboard / competition ----
        public UnityEvent onLeaderboardRefreshed;
        public UnityEvent onMonthlyReset;

        // ---- In-game advertising ----
        public UnityEvent onBillboardSpawned;
        public UnityEvent onBillboardReleased;
    }

    /// <summary>String-typed UnityEvent for profile/error signals.</summary>
    [Serializable]
    public class StringEvent : UnityEvent<string> { }

    /// <summary>Int-typed UnityEvent for score/speed signals.</summary>
    [Serializable]
    public class IntEvent : UnityEvent<int> { }
}
