using System;
namespace Velox.Leaderboard
{
    [Serializable] public sealed class LeaderboardEntryDto { public int rank; public string displayName; public string photoUrl; public int score; public bool isCurrentUser; }
    [Serializable] public sealed class LeaderboardResponseDto { public string periodId; public long resetsAtUnix; public LeaderboardEntryDto[] entries; public LeaderboardEntryDto myEntry; } // entries: max 10 (enforced server-side too)
    [Serializable] public sealed class PodiumDto { public string periodId; public LeaderboardEntryDto[] winners; } // final Top-3 snapshot of a closed month
}
