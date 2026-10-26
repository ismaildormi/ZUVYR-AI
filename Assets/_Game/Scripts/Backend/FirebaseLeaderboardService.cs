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
    /// Production leaderboard backed by Firebase Realtime Database.
    ///
    /// SECURITY MODEL (client side):
    /// - Every RTDB request carries an <c>Authorization: Bearer &lt;Firebase ID
    ///   token&gt;</c> header, satisfying the <c>auth != null</c> requirement in
    ///   the security rules. The token comes from <see cref="AccountSession"/>,
    ///   which obtains it via Firebase Auth (Google ID token -> signInWithIdToken,
    ///   or anonymous sign-up) and refreshes it before expiry.
    /// - A player writes only their own <c>leaderboard/{month}/{uid}</c> node, so
    ///   the <c>$uid</c> write rule (<c>auth.uid == $uid</c>) enforces that one
    ///   player cannot overwrite another's score.
    /// - Score sanity is validated client-side (defense-in-depth) and,
    ///   authoritatively, by the RTDB <c>.validate</c> rules on the server.
    /// - Writes to a finalized period are rejected: the official ranking is
    ///   frozen by an admin-gated Cloud Function before prizes are verified.
    ///
    /// LIMITATION: the client can still replay/forge a valid submission for its
    /// own UID (e.g. by tampering with the score before it is sent). The server
    /// enforces ownership and schema but cannot, from a single client write,
    /// prove the score reflects actual gameplay — anti-cheat beyond ownership
    /// requires server-side gameplay validation or trusted reporting, which is
    /// NOT implemented here. This service is therefore NOT cheat-proof.
    /// </summary>
    public class FirebaseLeaderboardService : ILeaderboardService
    {
        [Serializable]
        private class SubmitScoreRequest
        {
            public string name = string.Empty;
            public int score;
        }

        private readonly FirebaseConfig _config;
        private readonly Dictionary<string, List<LeaderboardEntry>> _cache =
            new Dictionary<string, List<LeaderboardEntry>>();
        private readonly HashSet<string> _finalizedMonths = new HashSet<string>();

        public event Action OnChanged;

        public FirebaseLeaderboardService(FirebaseConfig config)
        {
            _config = config;
            CurrentMonthKey = CompetitionPeriod.CurrentKey();
        }

        public string CurrentMonthKey { get; private set; }

        public void RaiseChanged() => OnChanged?.Invoke();

        private string MonthUrl(string month) =>
            _config.databaseUrl + "/leaderboard/" + Uri.EscapeDataString(month) + ".json";

        private string PlayerUrl(string month, string uid) =>
            MonthUrl(month) + "/" + Uri.EscapeDataString(uid);

        private string FinalUrl(string month) =>
            _config.databaseUrl + "/competition/" + Uri.EscapeDataString(month) + "/final.json";

        private string ArchiveUrl(string month) =>
            _config.databaseUrl + "/archive/" + Uri.EscapeDataString(month) + ".json";

        public async Task<IReadOnlyList<LeaderboardEntry>> GetTopAsync(int count)
        {
            if (!_config.IsValid(out string reason))
            {
                Debug.LogError("[VELOX] Firebase leaderboard misconfigured: " + reason);
                return new List<LeaderboardEntry>();
            }

            string text = await SendAsync(UnityWebRequest.Get(MonthUrl(CurrentMonthKey)));
            var list = MiniJson.ToEntries(MiniJson.Parse(text), CurrentMonthKey);
            Sort(list);
            return list.Take(Math.Max(1, count)).ToList();
        }

        public async Task<bool> SubmitScoreAsync(string name, int score)
        {
            if (!_config.IsValid(out string reason))
            {
                Debug.LogError("[VELOX] Firebase leaderboard misconfigured: " + reason);
                return false;
            }

            AccountSession session = ServiceLocator.AccountSession;
            string uid = session != null && session.HasProfile ? session.CurrentUser.localId : null;
            if (string.IsNullOrEmpty(uid))
            {
                Debug.LogError("[VELOX] Score rejected: no authenticated player (UID required).");
                return false;
            }

            // Client-side validation (defense-in-depth; the server function is authoritative).
            string safeName = LeaderboardEntry.SanitiseName(name);
            if (!CompetitionRules.IsValidSubmission(score, safeName, isFinalized: false))
            {
                Debug.LogError("[VELOX] Score rejected: invalid score/name (" + score + ").");
                return false;
            }

            // A finalized period is frozen: no further writes.
            if (await IsFinalizedAsync(CurrentMonthKey))
            {
                Debug.LogError("[VELOX] Score rejected: period " + CurrentMonthKey + " is finalized.");
                return false;
            }

            // Ensure a fresh, authenticated ID token before the call.
            if (session != null && !await session.EnsureFreshTokenAsync())
            {
                Debug.LogError("[VELOX] Score rejected: no valid auth token (session expired).");
                return false;
            }

            if (string.IsNullOrEmpty(_config.submitScoreEndpoint))
            {
                Debug.LogError("[VELOX] submitScoreEndpoint is not configured.");
                return false;
            }

            // Submit through the server-authoritative Cloud Function. Clients
            // never write to the RTDB directly; the function verifies the
            // caller (stable UID), computes the period (UTC), validates, and
            // writes via the admin SDK.
            string body = JsonUtility.ToJson(new SubmitScoreRequest { name = safeName, score = score });
            string text = await SendAsync(UnityWebRequest.Post(_config.submitScoreEndpoint, "application/json", body));

            var resp = MiniJson.Parse(text) as Dictionary<string, object>;
            bool ok = resp != null && resp.TryGetValue("ok", out object v) && v is bool b && b;
            if (ok) RaiseChanged();
            return ok;
        }

        public async Task<bool> IsFinalizedAsync(string month)
        {
            if (!_finalizedMonths.Contains(month))
            {
                string text = await SendAsync(UnityWebRequest.Get(FinalUrl(month)));
                bool finalized = !string.IsNullOrEmpty(text) && text != "null";
                if (finalized) _finalizedMonths.Add(month);
            }
            return _finalizedMonths.Contains(month);
        }

        public async Task<bool> FinalizeMonthAsync(string month)
        {
            if (!_config.IsValid(out string reason))
            {
                Debug.LogError("[VELOX] Firebase leaderboard misconfigured: " + reason);
                return false;
            }

            if (string.IsNullOrEmpty(_config.finalizeEndpoint))
            {
                Debug.LogError("[VELOX] finalizeEndpoint is not configured.");
                return false;
            }

            if (await IsFinalizedAsync(month))
            {
                Debug.LogWarning("[VELOX] Month " + month + " is already finalized; skipping.");
                return true;
            }

            string url = _config.finalizeEndpoint + "?month=" + Uri.EscapeDataString(month);
            await SendAsync(UnityWebRequest.Post(url, "application/json", "{}"));
            _finalizedMonths.Add(month);
            RaiseChanged();
            return true;
        }

        public async Task<IReadOnlyList<LeaderboardEntry>> GetFinalizedAsync(string month, int count)
        {
            string text = await SendAsync(UnityWebRequest.Get(FinalUrl(month)));
            if (string.IsNullOrEmpty(text) || text == "null")
                return new List<LeaderboardEntry>();

            var root = MiniJson.Parse(text) as Dictionary<string, object>;
            object entriesNode = root != null && root.TryGetValue("entries", out object en) ? en : null;
            var list = MiniJson.ToEntryArray(entriesNode);
            Sort(list);
            return list.Take(Math.Max(1, count)).ToList();
        }

        private async Task<string> SendAsync(UnityWebRequest request)
        {
            // Authenticate every RTDB request with the Firebase ID token.
            AccountSession session = ServiceLocator.AccountSession;
            if (session != null)
            {
                string token = session.CurrentIdToken;
                if (!string.IsNullOrEmpty(token))
                    request.SetRequestHeader("Authorization", "Bearer " + token);
            }

            var op = request.SendWebRequest();
            while (!op.isDone) await Task.Yield();

            if (request.result != UnityWebRequest.Result.Success)
            {
                Debug.LogError("[VELOX] Leaderboard request failed (" + request.result + "): " +
                               request.error);
                return string.Empty;
            }

            return request.downloadHandler != null ? request.downloadHandler.text : string.Empty;
        }

        public async Task ResetCurrentMonthAsync()
        {
            if (!_config.IsValid(out string reason))
            {
                Debug.LogError("[VELOX] Firebase leaderboard misconfigured: " + reason);
                return;
            }

            if (!string.IsNullOrEmpty(_config.monthlyResetEndpoint))
            {
                await SendAsync(UnityWebRequest.Post(_config.monthlyResetEndpoint, "application/json", "{}"));
                CurrentMonthKey = CompetitionPeriod.CurrentKey();
                RaiseChanged();
                return;
            }

            Debug.LogWarning("[VELOX] No monthlyResetEndpoint configured; server-side reset will not run.");
        }

        private static void Sort(List<LeaderboardEntry> list)
        {
            // Authoritative ordering (mirrored by the Cloud Function):
            // highest score first; ties broken by earlier submission, then name.
            list.Sort((x, y) =>
            {
                if (x.score != y.score) return y.score.CompareTo(x.score);
                if (x.timestamp != y.timestamp) return x.timestamp.CompareTo(y.timestamp);
                return string.CompareOrdinal(x.name, y.name);
            });
        }
    }
}
