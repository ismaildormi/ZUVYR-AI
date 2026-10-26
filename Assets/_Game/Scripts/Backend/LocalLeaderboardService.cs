using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using UnityEngine;

namespace VELOX.Backend
{
    /// <summary>
    /// Offline, client-authoritative leaderboard used for QA / no-backend builds.
    /// Scores persist to a local JSON file and month buckets roll over on a
    /// calendar-month boundary.
    ///
    /// SECURITY NOTE: this implementation is client-authoritative and therefore
    /// CAN be manipulated (a user can edit the JSON file or the service in
    /// memory). It is only suitable for offline QA. For the official competition
    /// use <see cref="FirebaseLeaderboardService"/>, which is server-backed.
    /// </summary>
    public class LocalLeaderboardService : ILeaderboardService
    {
        [Serializable]
        private class LocalLeaderboardSnapshot
        {
            public List<MonthBucket> months = new List<MonthBucket>();
            public List<MonthBucket> finalized = new List<MonthBucket>();
        }

        private static readonly string[] MonthOrder =
        {
            "01","02","03","04","05","06","07","08","09","10","11","12"
        };

        private readonly string _dataFile;
        private readonly Dictionary<string, List<LeaderboardEntry>> _months =
            new Dictionary<string, List<LeaderboardEntry>>();

        // Immutable finalized snapshots, keyed by month. Never cleared by rollover.
        private readonly Dictionary<string, List<LeaderboardEntry>> _finalized =
            new Dictionary<string, List<LeaderboardEntry>>();
        private readonly Dictionary<string, long> _finalizedAt =
            new Dictionary<string, long>();

        public LocalLeaderboardService()
        {
            _dataFile = Path.Combine(Application.persistentDataPath, "velox_leaderboard.json");
            CurrentMonthKey = CompetitionPeriod.CurrentKey();
            Load();
            RolloverIfMonthChanged();
        }

        public event Action OnChanged;

        public string CurrentMonthKey { get; private set; }

        /// <summary>Current competition month (UTC), for convenience/tests.</summary>
        public static string CurrentMonthKeyStatic() => CompetitionPeriod.CurrentKey();

        public void RaiseChanged() => OnChanged?.Invoke();

        public async Task<IReadOnlyList<LeaderboardEntry>> GetTopAsync(int count)
        {
            RolloverIfMonthChanged();
            var entries = GetEntries(CurrentMonthKey);
            entries.Sort(CompareEntries);
            var top = entries.Take(Math.Max(1, count)).ToList();
            await Task.CompletedTask;
            return top;
        }

        public async Task<bool> SubmitScoreAsync(string name, int score)
        {
            RolloverIfMonthChanged();

            // Client-side validation mirrors the server rules (defense-in-depth).
            string safeName = LeaderboardEntry.SanitiseName(name);
            if (!CompetitionRules.IsValidSubmission(score, safeName, isFinalized: false))
            {
                Debug.LogError("[VELOX] Local score rejected: invalid score/name (" + score + ").");
                await Task.CompletedTask;
                return false;
            }

            // A finalized period is frozen: no further writes.
            if (_finalized.ContainsKey(CurrentMonthKey))
            {
                Debug.LogError("[VELOX] Local score rejected: period " + CurrentMonthKey + " is finalized.");
                await Task.CompletedTask;
                return false;
            }

            LeaderboardEntry entry = new LeaderboardEntry
            {
                id = string.Empty, // filled after merge
                name = safeName,
                score = score,
                month = CurrentMonthKey,
                timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
            };

            var entries = GetEntries(CurrentMonthKey);
            bool found = false;
            for (int i = 0; i < entries.Count; i++)
            {
                if (string.Equals(entry.name, entries[i].name, StringComparison.Ordinal))
                {
                    found = true;
                    // Keep the BEST score per name (no silent downgrade).
                    if (score > entries[i].score)
                    {
                        entry.timestamp = entries[i].timestamp;
                        entry.id = entries[i].id;
                        entries[i] = entry;
                    }
                    break;
                }
            }

            if (!found)
            {
                entry.id = Guid.NewGuid().ToString("N").Substring(0, 12);
                entries.Add(entry);
            }

            Save();
            RaiseChanged();
            await Task.CompletedTask;
            return true;
        }

        /// <summary>
        /// Finalizes a month: snapshots its Top-10 into an immutable record and
        /// freezes the ranking. Idempotent — re-finalizing returns true without
        /// changing the existing snapshot.
        /// </summary>
        public async Task<bool> FinalizeMonthAsync(string month)
        {
            RolloverIfMonthChanged();
            month = CompetitionPeriod.IsValidKey(month) ? month : CurrentMonthKey;

            if (_finalized.ContainsKey(month))
            {
                await Task.CompletedTask;
                return true; // idempotent
            }

            var entries = GetEntries(month);
            entries.Sort(CompareEntries);
            var snapshot = entries.Take(10).Select(CopyOf).ToList();
            _finalized[month] = snapshot;
            _finalizedAt[month] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

            Save();
            RaiseChanged();
            await Task.CompletedTask;
            return true;
        }

        public async Task<bool> IsFinalizedAsync(string month)
        {
            await Task.CompletedTask;
            return _finalized.ContainsKey(month);
        }

        public async Task<IReadOnlyList<LeaderboardEntry>> GetFinalizedAsync(string month, int count)
        {
            await Task.CompletedTask;
            if (!_finalized.TryGetValue(month, out var entries))
                return new List<LeaderboardEntry>();

            // Return an immutable copy so callers cannot mutate the frozen record.
            var copy = entries.Select(CopyOf).ToList();
            return copy.Take(Math.Max(1, count)).ToList();
        }

        public async Task ResetCurrentMonthAsync()
        {
            RolloverIfMonthChanged();
            ClearCurrentMonth();
            await Task.CompletedTask;
        }

        /// <summary>Advances to the current UTC month if it has changed.</summary>
        private void RolloverIfMonthChanged()
        {
            string current = CompetitionPeriod.CurrentKey();
            if (!string.Equals(current, CurrentMonthKey, StringComparison.Ordinal))
            {
                CurrentMonthKey = current;
                ClearCurrentMonth(); // only the new (empty) month; history preserved
            }
        }

        /// <summary>
        /// Clears standings for the current month. Previous months are preserved
        /// as history (and remain available for finalization), so this is a
        /// per-period reset, never a global wipe.
        /// </summary>
        private void ClearCurrentMonth()
        {
            _months[CurrentMonthKey] = new List<LeaderboardEntry>();
            Save();
            RaiseChanged();
        }

        private List<LeaderboardEntry> GetEntries(string month)
        {
            if (!_months.TryGetValue(month, out var list))
            {
                list = new List<LeaderboardEntry>();
                _months[month] = list;
            }
            return list;
        }

        private static LeaderboardEntry CopyOf(LeaderboardEntry e) => new LeaderboardEntry
        {
            id = e.id,
            name = e.name,
            score = e.score,
            month = e.month,
            timestamp = e.timestamp
        };

        private static int CompareEntries(LeaderboardEntry x, LeaderboardEntry y)
        {
            // Highest score first; ties broken by earlier submission, then name.
            if (x.score != y.score) return y.score.CompareTo(x.score);
            if (x.timestamp != y.timestamp) return x.timestamp.CompareTo(y.timestamp);
            return string.CompareOrdinal(x.name, y.name);
        }

        private void Load()
        {
            if (!File.Exists(_dataFile)) return;

            try
            {
                string json = File.ReadAllText(_dataFile);
                var snapshot = JsonUtility.FromJson<LocalLeaderboardSnapshot>(json);
                if (snapshot == null) return;

                foreach (MonthBucket bucket in snapshot.months)
                    _months[bucket.month] = bucket.entries ?? new List<LeaderboardEntry>();

                foreach (MonthBucket bucket in snapshot.finalized)
                {
                    _finalized[bucket.month] = bucket.entries ?? new List<LeaderboardEntry>();
                    _finalizedAt[bucket.month] = bucket.timestamp;
                }
            }
            catch (Exception e)
            {
                Debug.LogError("[VELOX] Failed to load local leaderboard: " + e.Message);
                _months.Clear();
            }
        }

        private void Save()
        {
            Directory.CreateDirectory(Application.persistentDataPath);

            var snapshot = new LocalLeaderboardSnapshot
            {
                months = new List<MonthBucket>(),
                finalized = new List<MonthBucket>()
            };

            foreach (KeyValuePair<string, List<LeaderboardEntry>> kv in _months)
            {
                // Store the most recent 12 months in chronological order.
                if (!MonthOrder.Contains(kv.Key.Length >= 7 ? kv.Key.Substring(5) : string.Empty))
                    continue;
                snapshot.months.Add(new MonthBucket { month = kv.Key, entries = kv.Value });
            }

            snapshot.months = snapshot.months
                .OrderBy(b => b.month, StringComparer.Ordinal)
                .TakeLast(12)
                .ToList();

            foreach (KeyValuePair<string, List<LeaderboardEntry>> kv in _finalized)
            {
                snapshot.finalized.Add(new MonthBucket
                {
                    month = kv.Key,
                    entries = kv.Value,
                    timestamp = _finalizedAt.TryGetValue(kv.Key, out long t) ? t : 0L
                });
            }

            snapshot.finalized = snapshot.finalized
                .OrderBy(b => b.month, StringComparer.Ordinal)
                .ToList();

            File.WriteAllText(_dataFile, JsonUtility.ToJson(snapshot));
        }
    }
}
