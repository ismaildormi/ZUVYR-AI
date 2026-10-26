using System;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;

namespace VELOX.Backend
{
    /// <summary>
    /// A single monthly leaderboard entry. Fields are public and
    /// <see cref="UnityEngine.JsonUtility"/>-friendly so the same DTO is used
    /// for local JSON persistence and the Firebase Realtime Database snapshot.
    /// </summary>
    [Serializable]
    public class LeaderboardEntry
    {
        public string id = string.Empty;
        public string name = string.Empty;
        public int score;
        /// <summary>Competition month in "yyyy-MM" form.</summary>
        public string month = string.Empty;
        public long timestamp;

        /// <summary>Removes control/whitespace characters and caps the length.</summary>
        public static string SanitiseName(string raw)
        {
            if (string.IsNullOrWhiteSpace(raw))
                return VELOX.Core.GameIdentity.PlayerName;

            var sb = new StringBuilder(raw.Length);
            for (int i = 0; i < raw.Length; i++)
            {
                char c = raw[i];
                if (char.IsLetterOrDigit(c)) sb.Append(char.ToUpperInvariant(c));
                else if (c == ' ') sb.Append('.');
            }
            string result = sb.ToString();
            if (result.Length > CompetitionRules.MaxNameLength)
                result = result.Substring(0, CompetitionRules.MaxNameLength);
            return result.Length == 0 ? VELOX.Core.GameIdentity.PlayerName : result;
        }
    }

    /// <summary>Serialisable wrapper used by local + Firebase snapshots.</summary>
    [Serializable]
    public class LeaderboardSnapshot
    {
        public List<LeaderboardEntry> entries = new List<LeaderboardEntry>();
    }

    /// <summary>One month bucket used by the local JSON store.</summary>
    [Serializable]
    public class MonthBucket
    {
        public string month = string.Empty;
        public List<LeaderboardEntry> entries = new List<LeaderboardEntry>();
        /// <summary>Finalization time (epoch ms); 0 for live (non-finalized) buckets.</summary>
        public long timestamp;
    }

    /// <summary>
    /// Storage abstraction for the monthly Top-10 competition.
    /// Implementations: <see cref="LocalLeaderboardService"/> (offline) and
    /// <see cref="FirebaseLeaderboardService"/> (production).
    /// </summary>
    public interface ILeaderboardService
    {
        /// <summary>Current competition month key (yyyy-MM).</summary>
        string CurrentMonthKey { get; }

        /// <summary>Raised when the leaderboard changes (scores/reset).</summary>
        event Action OnChanged;

        /// <summary>Raises <see cref="OnChanged"/>. Only the owning service may raise it.</summary>
        void RaiseChanged();

        /// <summary>Returns the best <paramref name="count"/> entries for the month.</summary>
        Task<IReadOnlyList<LeaderboardEntry>> GetTopAsync(int count);

        /// <summary>Submits a score for the named player for the current month.</summary>
        Task<bool> SubmitScoreAsync(string name, int score);

        /// <summary>Clears the current month's standings (monthly reset).</summary>
        Task ResetCurrentMonthAsync();

        /// <summary>True when the given month has been finalized (ranking frozen).</summary>
        Task<bool> IsFinalizedAsync(string month);

        /// <summary>
        /// Requests finalization of a month: an admin-gated operation that
        /// snapshots the official Top-10 and freezes the ranking for giveaway
        /// verification. Returns false when finalization is unavailable or
        /// refused (e.g. already finalized).
        /// </summary>
        Task<bool> FinalizeMonthAsync(string month);

        /// <summary>Returns the finalized Top-<paramref name="count"/> snapshot for a month.</summary>
        Task<IReadOnlyList<LeaderboardEntry>> GetFinalizedAsync(string month, int count);
    }
}
