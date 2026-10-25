using System;
namespace Velox.Leaderboard
{
    /// <summary>Authoritative period is decided server-side; this mirror is only for UI countdown/display.</summary>
    public static class MonthlyPeriod
    {
        public static string CurrentId(DateTime utcNow) => $"{utcNow.Year:D4}-{utcNow.Month:D2}";
        public static DateTime NextResetUtc(DateTime utcNow) => new DateTime(utcNow.Year, utcNow.Month, 1, 0,0,0, DateTimeKind.Utc).AddMonths(1);
        public static TimeSpan TimeToReset(DateTime utcNow) => NextResetUtc(utcNow) - utcNow;
        public static bool IsNewPeriod(string storedId, DateTime utcNow) => !string.Equals(storedId, CurrentId(utcNow), StringComparison.Ordinal);
    }
}
