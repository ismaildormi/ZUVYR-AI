using System;
using System.Text;
using VELOX.Core;

namespace VELOX.Backend
{
    /// <summary>
    /// Immutable-ish representation of a signed-in player. Used by
    /// <see cref="AccountSession"/> and rendered in the leaderboard / UI.
    /// </summary>
    [Serializable]
    public class PlayerProfile
    {
        public string localId = string.Empty;
        public string displayName = string.Empty;
        public string email = string.Empty;
        public string photoUrl = string.Empty;
        public string provider = string.Empty;

        /// <summary>Best available display name, falling back to the game character.</summary>
        public string DisplayName =>
            string.IsNullOrWhiteSpace(displayName) ? GameIdentity.PlayerName : displayName;

        /// <summary>Leaderboard-safe name (spaces/emoji stripped, length capped).</summary>
        public string SafeDisplayName => LeaderboardEntry.SanitiseName(DisplayName);

        public PlayerProfile Copy() => new PlayerProfile
        {
            localId = localId,
            displayName = displayName,
            email = email,
            photoUrl = photoUrl,
            provider = provider
        };
    }
}
