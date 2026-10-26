using System;
using System.Globalization;
using System.Text.RegularExpressions;

namespace VELOX.Backend
{
    /// <summary>
    /// Canonical competition-period math. A single, documented timezone (UTC)
    /// and a consistent <c>yyyy-MM</c> month identifier are used everywhere —
    /// client, security rules and Cloud Functions — so year boundaries and
    /// month transitions are unambiguous.
    /// </summary>
    public static class CompetitionPeriod
    {
        /// <summary>The one competition timezone (UTC).</summary>
        public const string Timezone = "UTC";

        /// <summary>Month identifier format.</summary>
        public const string Format = "yyyy-MM";

        private static readonly Regex KeyRegex =
            new(@"^\d{4}-(0[1-9]|1[0-2])$", RegexOptions.Compiled);

        /// <summary>Month key for a UTC instant.</summary>
        public static string Key(DateTime utc) => utc.ToString(Format, CultureInfo.InvariantCulture);

        /// <summary>Current competition month (UTC now).</summary>
        public static string CurrentKey() => Key(DateTime.UtcNow);

        /// <summary>True for a well-formed <c>yyyy-MM</c> month with month 01..12.</summary>
        public static bool IsValidKey(string key) =>
            !string.IsNullOrEmpty(key) && KeyRegex.IsMatch(key);

        /// <summary>
        /// The month immediately before <paramref name="current"/>, correctly
        /// crossing year boundaries (2026-01 -> 2025-12).
        /// </summary>
        public static string PreviousKey(string current)
        {
            if (!IsValidKey(current)) return current;

            int year = int.Parse(current.Substring(0, 4), CultureInfo.InvariantCulture);
            int month = int.Parse(current.Substring(5, 2), CultureInfo.InvariantCulture);
            month--;
            if (month < 1) { month = 12; year--; }
            return string.Format(CultureInfo.InvariantCulture, "{0:D4}-{1:D2}", year, month);
        }
    }

    /// <summary>
    /// Score/name validation and competition constants. These mirror the
    /// server-side rules so the client can reject obviously invalid submissions
    /// early (defense-in-depth); the Firebase rules remain authoritative.
    /// </summary>
    public static class CompetitionRules
    {
        /// <summary>
        /// Sanity upper bound for a score (1e12). This is NOT a gameplay cap —
        /// it only rejects absurd/overflow values that indicate tampering. An
        /// endless runner's score grows without bound, so no gameplay cap is
        /// imposed.
        /// </summary>
        public const long MaxScore = 1_000_000_000_000L;

        public const long MinScore = 0L;
        public const int MaxNameLength = 24;

        /// <summary>The competition timezone (mirrors <see cref="CompetitionPeriod.Timezone"/>).</summary>
        public const string Timezone = CompetitionPeriod.Timezone;

        public static bool IsValidScore(long score) => score >= MinScore && score <= MaxScore;

        /// <summary>
        /// Whether a submission should be accepted. A finalized period rejects
        /// all further writes; the score must be in range and the name present.
        /// </summary>
        public static bool IsValidSubmission(long score, string name, bool isFinalized) =>
            !isFinalized && IsValidScore(score) && !string.IsNullOrEmpty(name);
    }
}
