using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using UnityEngine;

namespace VELOX.Backend
{
    [Serializable]
    public class LocalLeaderboardSnapshot
    {
        public List<MonthBucket> months = new List<MonthBucket>();
    }

    /// <summary>
    /// Offline monthly leaderboard backed by a JSON file in
    /// <see cref="Application.persistentDataPath"/>. Fully functional for QA and
    /// for builds without a backend. Scoped per month; resets are instant.
    /// </summary>
    public class LocalLeaderboardService : ILeaderboardService
    {
        private readonly string _filePath;
        private readonly Dictionary<string, List<LeaderboardEntry>> _months =
            new Dictionary<string, List<LeaderboardEntry>>();

        public LocalLeaderboardService()
        {
            _filePath = Path.Combine(Application.persistentDataPath, "velox_leaderboard.json");
            Load();
        }

        public string CurrentMonthKey => CurrentMonthKeyStatic();

        /// <summary>UTC month key used to scope the competition.</summary>
        public static string CurrentMonthKeyStatic() => DateTime.UtcNow.ToString("yyyy-MM");

        public event Action OnChanged;

        /// <inheritdoc/>
        public void RaiseChanged() => OnChanged?.Invoke();

        public Task<IReadOnlyList<LeaderboardEntry>> GetTopAsync(int count)
        {
            List<LeaderboardEntry> list = _months.TryGetValue(CurrentMonthKey, out var bucket)
                ? new List<LeaderboardEntry>(bucket)
                : new List<LeaderboardEntry>();

            list.Sort((a, b) =>
            {
                int c = b.score.CompareTo(a.score);
                if (c != 0) return c;
                int t = a.timestamp.CompareTo(b.timestamp);
                if (t != 0) return t;
                return string.CompareOrdinal(a.name, b.name);
            });

            List<LeaderboardEntry> top = list.Take(Math.Max(1, count)).ToList();
            return Task.FromResult<IReadOnlyList<LeaderboardEntry>>(top);
        }

        public Task<bool> SubmitScoreAsync(string name, int score)
        {
            string safeName = LeaderboardEntry.SanitiseName(name);
            List<LeaderboardEntry> bucket = EnsureBucket(CurrentMonthKey);

            int existing = bucket.FindIndex(e => string.Equals(e.name, safeName, StringComparison.Ordinal));
            if (existing >= 0)
            {
                if (score > bucket[existing].score) bucket[existing].score = score;
            }
            else
            {
                bucket.Add(new LeaderboardEntry
                {
                    id = Guid.NewGuid().ToString("N"),
                    name = safeName,
                    score = score,
                    month = CurrentMonthKey,
                    timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                });
            }

            Save();
            OnChanged?.Invoke();
            return Task.FromResult(true);
        }

        public Task ResetCurrentMonthAsync()
        {
            _months.Remove(CurrentMonthKey);
            Save();
            OnChanged?.Invoke();
            return Task.CompletedTask;
        }

        private List<LeaderboardEntry> EnsureBucket(string month)
        {
            if (!_months.TryGetValue(month, out var bucket))
            {
                bucket = new List<LeaderboardEntry>();
                _months[month] = bucket;
            }
            return bucket;
        }

        private void Load()
        {
            try
            {
                if (!File.Exists(_filePath)) return;

                string json = File.ReadAllText(_filePath);
                LocalLeaderboardSnapshot snapshot = JsonUtility.FromJson<LocalLeaderboardSnapshot>(json);
                if (snapshot == null || snapshot.months == null) return;

                foreach (MonthBucket bucket in snapshot.months)
                    if (!string.IsNullOrEmpty(bucket.month))
                        _months[bucket.month] = bucket.entries ?? new List<LeaderboardEntry>();
            }
            catch (Exception e)
            {
                Debug.LogWarning("[VELOX] Failed to load local leaderboard: " + e.Message);
            }
        }

        private void Save()
        {
            try
            {
                LocalLeaderboardSnapshot snapshot = new LocalLeaderboardSnapshot();
                foreach (KeyValuePair<string, List<LeaderboardEntry>> kv in _months)
                    snapshot.months.Add(new MonthBucket { month = kv.Key, entries = kv.Value });

                File.WriteAllText(_filePath, JsonUtility.ToJson(snapshot));
            }
            catch (Exception e)
            {
                Debug.LogWarning("[VELOX] Failed to save local leaderboard: " + e.Message);
            }
        }
    }
}
