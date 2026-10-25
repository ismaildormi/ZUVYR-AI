using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.Networking;
using VELOX.Core;

namespace VELOX.Backend
{
    /// <summary>
    /// Production monthly leaderboard backed by the Firebase Realtime Database.
    ///
    /// SECURITY MODEL (server-authoritative):
    /// - Scores live per player under <c>leaderboard/{YYYY-MM}/{uid}</c>.
    /// - Security rules (firebase/rules/leaderboard.rules.json) let a signed-in
    ///   user write ONLY their own document (<c>auth.uid === $uid</c>); nobody
    ///   can overwrite another player's record.
    /// - The monthly rollover is performed by a secured Cloud Function
    ///   (firebase/functions/monthlyReset.js), NOT by clients.
    /// - This client only reads the current month or writes its own document;
    ///   it never clears global standings.
    /// </summary>
    public class FirebaseLeaderboardService : ILeaderboardService
    {
        private readonly FirebaseConfig _config;

        public FirebaseLeaderboardService(FirebaseConfig config)
        {
            _config = config;
        }

        public string CurrentMonthKey => LocalLeaderboardService.CurrentMonthKeyStatic();

        public event Action OnChanged;

        /// <inheritdoc/>
        public void RaiseChanged() => OnChanged?.Invoke();

        private string MonthUrl(string month) =>
            $"{_config.databaseUrl}/leaderboard/{Uri.EscapeDataString(month)}.json";

        private string PlayerUrl(string month, string uid) =>
            $"{_config.databaseUrl}/leaderboard/{Uri.EscapeDataString(month)}/{Uri.EscapeDataString(uid)}.json";

        public async Task<IReadOnlyList<LeaderboardEntry>> GetTopAsync(int count)
        {
            string text = await SendAsync(UnityWebRequest.Get(MonthUrl(CurrentMonthKey)));

            List<LeaderboardEntry> list = string.IsNullOrEmpty(text) || text == "null"
                ? new List<LeaderboardEntry>()
                : MiniJson.ToEntries(MiniJson.Parse(text), CurrentMonthKey);

            Sort(list);
            return list.Take(Math.Max(1, count)).ToList();
        }

        public async Task<bool> SubmitScoreAsync(string name, int score)
        {
            var session = ServiceLocator.AccountSession;
            string uid = session != null && session.HasProfile ? session.CurrentUser.localId : null;

            if (string.IsNullOrEmpty(uid))
            {
                // A stable, server-issued identity is required; a display name
                // alone must never be able to write a score.
                Debug.LogWarning("[VELOX] Score submission requires a signed-in player identity.");
                return false;
            }

            LeaderboardEntry entry = new LeaderboardEntry
            {
                id = uid,
                name = LeaderboardEntry.SanitiseName(name),
                score = score,
                month = CurrentMonthKey,
                timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
            };

            string body = JsonUtility.ToJson(entry);
            await SendAsync(UnityWebRequest.Put(PlayerUrl(CurrentMonthKey, uid), body));
            RaiseChanged();
            return true;
        }

        public async Task ResetCurrentMonthAsync()
        {
            // Server-authoritative: the client never resets global standings.
            if (!string.IsNullOrEmpty(_config.monthlyResetEndpoint))
            {
                await SendAsync(UnityWebRequest.Post(_config.monthlyResetEndpoint, "application/json", "{}"));
            }
            else
            {
                Debug.LogWarning(
                    "[VELOX] monthlyResetEndpoint not configured. The global monthly reset is performed by the " +
                    "deployed Cloud Function (firebase/functions/monthlyReset.js); see firebase/README.md.");
            }
            RaiseChanged();
        }

        private static void Sort(List<LeaderboardEntry> list)
        {
            list.Sort((a, b) =>
            {
                int c = b.score.CompareTo(a.score);
                if (c != 0) return c;
                int t = a.timestamp.CompareTo(b.timestamp);
                if (t != 0) return t;
                return string.CompareOrdinal(a.name, b.name);
            });
        }

        private async Task<string> SendAsync(UnityWebRequest request)
        {
            var op = request.SendWebRequest();
            while (!op.isDone) await Task.Yield();

            if (request.result != UnityWebRequest.Result.Success)
            {
                Debug.LogWarning("[VELOX] Leaderboard request failed: " + request.error);
                return string.Empty;
            }

            return request.downloadHandler != null ? request.downloadHandler.text : string.Empty;
        }
    }
}
