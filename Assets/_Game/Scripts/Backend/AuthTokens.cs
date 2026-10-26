using System;

namespace VELOX.Backend
{
    /// <summary>
    /// Firebase Auth token container. Holds the Firebase ID token (what RTDB
    /// rules need to authenticate), the refresh token, the stable Firebase UID
    /// and the profile fields. The ID token lasts ~1 hour; <see cref="expiresAt"/>
    /// records its expiry so the session can refresh before it expires.
    /// </summary>
    public class AuthTokens
    {
        public string idToken = string.Empty;
        public string refreshToken = string.Empty;
        public string localId = string.Empty;
        public string displayName = string.Empty;
        public string email = string.Empty;
        public string photoUrl = string.Empty;
        public string provider = string.Empty;

        /// <summary>ID-token expiry as epoch milliseconds (0 if unknown).</summary>
        public long expiresAt;

        /// <summary>True when the ID token is expired or about to expire (60s margin).</summary>
        public bool IsExpired(long nowMs) =>
            expiresAt > 0L && nowMs >= expiresAt - 60_000L;

        public PlayerProfile ToProfile() => new PlayerProfile
        {
            localId = localId,
            displayName = displayName,
            email = email,
            photoUrl = photoUrl,
            provider = provider
        };
    }
}
