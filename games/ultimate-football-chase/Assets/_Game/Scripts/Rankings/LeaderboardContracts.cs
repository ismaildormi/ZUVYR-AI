using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using UnityEngine;

namespace UltimateFootballChase.Rankings
{
    public enum BoardKind { Weekly, Monthly, Hall }

    [Serializable]
    public sealed class RankedEntry
    {
        // Public server-assigned opaque identifier: NEVER a raw Firebase UID or email.
        public string PublicId;
        public string Alias;
        public int Rank;
        public long Points; // server-defined; no score formula exists in the untrusted runner
    }

    [Serializable]
    public sealed class LeaderboardSnapshot
    {
        public int SchemaVersion = 1;
        public string Channel;
        public string PeriodKey;
        public string State;
        public long PublishedUtcTicks;
        public RankedEntry[] Entries;
    }

    public interface ILeaderboardGateway
    {
        bool IsConfigured { get; }
        // Read only. There is deliberately NO client method to submit score, set rank or award prizes.
        Task<LeaderboardSnapshot> FetchServerPublishedAsync(BoardKind kind);
    }

    public sealed class UnavailableLeaderboardGateway : ILeaderboardGateway
    {
        public bool IsConfigured => false;
        public Task<LeaderboardSnapshot> FetchServerPublishedAsync(BoardKind kind) =>
            Task.FromException<LeaderboardSnapshot>(new NotSupportedException(
                "No server-published standings service is configured"));
    }

    public static class LeaderboardGatewayFactory
    {
        public static ILeaderboardGateway Create()
        {
#if UFC_FIREBASE
            return new FirebaseLeaderboardGateway();
#else
            return new UnavailableLeaderboardGateway();
#endif
        }
    }

    /// <summary>Shape validation, NOT authentication. Trust requires server-only writes and server-only reads.</summary>
    public static class LeaderboardPolicy
    {
        private static readonly Regex WeeklyKey = new Regex(@"^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$", RegexOptions.CultureInvariant);
        private static readonly Regex MonthKey = new Regex(@"^[0-9]{4}-(0[1-9]|1[0-2])$", RegexOptions.CultureInvariant);
        private static readonly Regex PublicIdPattern = new Regex(@"^[A-Za-z0-9_-]{6,64}$", RegexOptions.CultureInvariant);
        public static string DocumentId(BoardKind kind)
        {
            switch (kind)
            {
                case BoardKind.Weekly: return "weekly_current";
                case BoardKind.Monthly: return "monthly_current";
                case BoardKind.Hall: return "hall_previous";
                default: throw new ArgumentOutOfRangeException(nameof(kind));
            }
        }
        public static bool IsValid(LeaderboardSnapshot view, BoardKind expected)
        {
            if (view == null || view.SchemaVersion != 1 || view.PublishedUtcTicks <= 0 ||
                view.Entries == null || view.Entries.Length > (expected == BoardKind.Hall ? 3 : 10)) return false;
            if (view.PublishedUtcTicks > DateTime.MaxValue.Ticks) return false;
            string channel = expected == BoardKind.Weekly ? "weekly" :
                expected == BoardKind.Monthly ? "monthly" : "hall";
            if (view.Channel != channel || view.PeriodKey == null || view.PeriodKey.Length > 12 ||
                !(expected == BoardKind.Weekly ? WeeklyKey : MonthKey).IsMatch(view.PeriodKey)) return false;
            int year = int.Parse(view.PeriodKey.Substring(0, 4), CultureInfo.InvariantCulture);
            if (year < 1) return false;
            if (expected == BoardKind.Weekly)
            {
                int week = int.Parse(view.PeriodKey.Substring(6, 2), CultureInfo.InvariantCulture);
                if (week > IsoWeeksInYear(year)) return false;
            }
            if (expected == BoardKind.Weekly && view.State != "live" && view.State != "closed") return false;
            if (expected == BoardKind.Monthly && view.State != "live" && view.State != "under_review") return false;
            if (expected == BoardKind.Hall && view.State != "archived") return false;
            var ids = new HashSet<string>(StringComparer.Ordinal);
            long previousPoints = long.MaxValue;
            for (int i = 0; i < view.Entries.Length; i++)
            {
                RankedEntry entry = view.Entries[i];
                if (entry == null || entry.Rank != i + 1 || entry.Points < 0 ||
                    entry.Points > 1000000000000L || entry.Points > previousPoints ||
                    string.IsNullOrEmpty(entry.PublicId) || entry.PublicId.Length < 6 ||
                    entry.PublicId.Length > 64 || !PublicIdPattern.IsMatch(entry.PublicId) || !ids.Add(entry.PublicId) ||
                    string.IsNullOrWhiteSpace(entry.Alias) || entry.Alias.Length > 24 ||
                    entry.Alias.Trim() != entry.Alias) return false;
                foreach (char c in entry.Alias)
                    if (char.IsControl(c) || char.IsSurrogate(c) || c == '<' || c == '>' ||
                        char.GetUnicodeCategory(c) == UnicodeCategory.Format ||
                        char.GetUnicodeCategory(c) == UnicodeCategory.LineSeparator ||
                        char.GetUnicodeCategory(c) == UnicodeCategory.ParagraphSeparator) return false;
                previousPoints = entry.Points;
            }
            return true;
        }
        private static int IsoWeeksInYear(int year)
        {
            DayOfWeek first = new DateTime(year, 1, 1).DayOfWeek;
            return first == DayOfWeek.Thursday ||
                (first == DayOfWeek.Wednesday && DateTime.IsLeapYear(year)) ? 53 : 52;
        }
        public static LeaderboardSnapshot Copy(LeaderboardSnapshot view) =>
            view == null ? null : JsonUtility.FromJson<LeaderboardSnapshot>(JsonUtility.ToJson(view));
    }
}
