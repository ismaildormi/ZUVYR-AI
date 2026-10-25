using UnityEngine;

namespace VELOX.UI
{
    /// <summary>
    /// Periodically checks whether the calendar month has rolled over and, if
    /// so, asks the <see cref="LeaderboardManager"/> to reset the monthly Top-10
    /// competition so a fresh contest can begin.
    /// </summary>
    public class MonthlyLeaderboardReset : MonoBehaviour
    {
        public LeaderboardManager manager;
        [Range(10f, 3600f)] public float checkInterval = 120f;

        private float _timer;

        void Update()
        {
            if (manager == null) return;

            _timer += Time.deltaTime;
            if (_timer >= checkInterval)
            {
                _timer = 0f;
                manager.EnsureMonthlyReset();
            }
        }

        /// <summary>Forces an immediate monthly reset (manual / admin action).</summary>
        public void ResetMonthlyLeaderboardNow()
        {
            if (manager != null) manager.EnsureMonthlyReset(true);
        }
    }
}
