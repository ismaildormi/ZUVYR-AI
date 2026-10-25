using System;

namespace VELOX.Core
{
    /// <summary>
    /// Single source of truth for the game's brand identity.
    /// Changing the values here rebrands every UI surface at once
    /// (title, HUD, leaderboard, billboards, analytics, deep links).
    /// </summary>
    /// <remarks>
    /// The canonical product name is <c>VELOX</c> and the official runner
    /// character is <c>NEO</c>. <see cref="LegacyGameName"/> is kept only for
    /// migration/reference and is never rendered in the live UI.
    /// </remarks>
    public static class GameIdentity
    {
        /// <summary>Canonical product name rendered across all UI (VELOX).</summary>
        public const string GameName = "VELOX";

        /// <summary>Official runner character name (NEO).</summary>
        public const string PlayerName = "NEO";

        /// <summary>Legacy/alternate brand name kept only for reference.</summary>
        public const string LegacyGameName = "DashX";

        /// <summary>Publisher/company namespace.</summary>
        public const string CompanyName = "ZUVYR";

        /// <summary>Human readable build version.</summary>
        public const string BuildVersion = "1.0.0";

        // ---- Analytics / event keys ----
        public const string AnalyticsGameName = "VELOX";
        public const string AnalyticsCharacterName = "NEO";

        // ---- Competition / leaderboard contract ----
        /// <summary>How many players the monthly leaderboard keeps.</summary>
        public const int LeaderboardSize = 10;

        /// <summary>How many podium positions are celebrated each month.</summary>
        public const int TopPodiumCount = 3;

        /// <summary>Display title used in the title screen / HUD.</summary>
        public static string Title => GameName;
    }
}
