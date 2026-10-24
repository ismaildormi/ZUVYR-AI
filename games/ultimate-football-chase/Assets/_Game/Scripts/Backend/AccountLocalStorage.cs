using System;
using System.Security.Cryptography;
using System.Text;
using UnityEngine;
using UltimateFootballChase.Hub;

namespace UltimateFootballChase.Backend
{
    /// <summary>Account-specific OFFLINE cache. Firebase UID is hashed for the local key, not treated as a secret.</summary>
    public sealed class AccountLocalStorage : IHubProgressRepository
    {
        private readonly string key;
        public AccountLocalStorage(string firebaseUid)
        {
            if (string.IsNullOrEmpty(firebaseUid)) throw new ArgumentException("Missing authenticated UID");
            key = "ufc.hub.account.v1." + Hash(firebaseUid);
        }
        internal static string Hash(string value)
        {
            using (var sha = SHA256.Create())
            {
                byte[] digest = sha.ComputeHash(Encoding.UTF8.GetBytes(value));
                return BitConverter.ToString(digest).Replace("-", "").ToLowerInvariant();
            }
        }
        public bool HasCache => PlayerPrefs.HasKey(key);
        public HubProgress Load()
        {
            if (!HasCache) return null;
            try { return HubProgressSanitizer.Clean(JsonUtility.FromJson<HubProgress>(PlayerPrefs.GetString(key))); }
            catch (Exception ex) { Debug.LogWarning("Account cache unreadable: " + ex.Message); return null; }
        }
        public void Save(HubProgress progress)
        {
            if (progress == null) throw new ArgumentNullException(nameof(progress));
            progress.LastSavedUtcTicks = DateTime.UtcNow.Ticks;
            SaveSnapshot(progress);
        }
        public void SaveSnapshot(HubProgress progress)
        {
            HubProgress copy = HubProgressSanitizer.Clean(AccountHubPolicy.Clone(progress));
            PlayerPrefs.SetString(key, JsonUtility.ToJson(copy));
            PlayerPrefs.Save();
        }
    }

    /// <summary>Provides synchronous read/write to gameplay while queuing authenticated cloud writes.</summary>
    public sealed class AccountBoundHubRepository : IHubProgressRepository
    {
        private readonly AccountLocalStorage cache;
        private readonly Action<HubProgress> scheduleRemote;
        public AccountBoundHubRepository(AccountLocalStorage accountCache, Action<HubProgress> schedule)
        {
            cache = accountCache ?? throw new ArgumentNullException(nameof(accountCache));
            scheduleRemote = schedule ?? throw new ArgumentNullException(nameof(schedule));
        }
        public HubProgress Load() => cache.Load() ?? new HubProgress();
        public void Save(HubProgress progress)
        {
            cache.Save(progress);
            scheduleRemote(AccountHubPolicy.Clone(progress));
        }
    }

    /// <summary>Prevent silently importing one guest profile into multiple new Firebase accounts.</summary>
    public static class GuestClaimMarker
    {
        private const string ClaimKey = "ufc.hub.guest.claimed.v1";
        private const string PendingKey = "ufc.hub.guest.claim.pending.v1";
        public static bool WasClaimed => PlayerPrefs.HasKey(ClaimKey);
        public static bool CanClaim(string uid) => !WasClaimed &&
            (!PlayerPrefs.HasKey(PendingKey) || PlayerPrefs.GetString(PendingKey) == AccountLocalStorage.Hash(uid));
        public static bool ReservedFor(string uid) => !WasClaimed &&
            PlayerPrefs.GetString(PendingKey) == AccountLocalStorage.Hash(uid);
        public static void ForgetGuestClaimMarkers()
        {
            // Guest reset only. Never delete a UID-scoped account cache or remote profile here.
            PlayerPrefs.DeleteKey(ClaimKey);
            PlayerPrefs.DeleteKey(PendingKey);
            PlayerPrefs.Save();
        }
        public static void Reserve(string verifiedFirebaseUid)
        {
            if (!CanClaim(verifiedFirebaseUid)) throw new InvalidOperationException("Guest profile already reserved/claimed");
            PlayerPrefs.SetString(PendingKey, AccountLocalStorage.Hash(verifiedFirebaseUid));
            PlayerPrefs.Save();
        }
        public static void MarkClaimed(string verifiedFirebaseUid)
        {
            if (!ReservedFor(verifiedFirebaseUid))
                throw new InvalidOperationException("Guest reservation must match authenticated UID");
            PlayerPrefs.SetString(ClaimKey, AccountLocalStorage.Hash(verifiedFirebaseUid));
            PlayerPrefs.DeleteKey(PendingKey);
            PlayerPrefs.Save();
        }
    }
}
