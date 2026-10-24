using System;
using System.Threading.Tasks;
using UnityEngine;
using UltimateFootballChase.Hub;

namespace UltimateFootballChase.Backend
{
    /// <summary>Identity is assigned ONLY by Firebase Auth; never use a player-entered UID.</summary>
    public sealed class AccountIdentity
    {
        public readonly string Uid;
        public readonly string Provider;
        public AccountIdentity(string uid, string provider)
        {
            if (string.IsNullOrWhiteSpace(uid)) throw new ArgumentException("Firebase UID is required", nameof(uid));
            Uid = uid;
            Provider = provider ?? "unknown";
        }
    }

    public interface IAccountAuthGateway
    {
        bool IsConfigured { get; }
        Task<AccountIdentity> RestoreAsync();
        Task<AccountIdentity> GoogleAsync();
        Task<AccountIdentity> AppleAsync();
        Task<AccountIdentity> GameCenterAsync();
        Task SignOutAsync();
    }

    public interface ICloudHubStore
    {
        // null means a confirmed NOT FOUND response. Network failure MUST throw instead.
        Task<HubProgress> FetchAsync(string firebaseUid);
        Task SaveAsync(string firebaseUid, HubProgress progress);
    }

    internal sealed class UnconfiguredAuthGateway : IAccountAuthGateway
    {
        public bool IsConfigured => false;
        public Task<AccountIdentity> RestoreAsync() => Task.FromResult<AccountIdentity>(null);
        public Task<AccountIdentity> GoogleAsync() => Task.FromException<AccountIdentity>(Unavailable());
        public Task<AccountIdentity> AppleAsync() => Task.FromException<AccountIdentity>(Unavailable());
        public Task<AccountIdentity> GameCenterAsync() => Task.FromException<AccountIdentity>(Unavailable());
        public Task SignOutAsync() => Task.CompletedTask;
        private static Exception Unavailable() =>
            new InvalidOperationException("Cloud sign-in unavailable: import Firebase Unity Auth/Firestore SDK and configure provider credentials first.");
    }

    internal sealed class UnconfiguredCloudStore : ICloudHubStore
    {
        public Task<HubProgress> FetchAsync(string uid) => Task.FromException<HubProgress>(Unavailable());
        public Task SaveAsync(string uid, HubProgress p) => Task.FromException(Unavailable());
        private static Exception Unavailable() => new InvalidOperationException("Firestore SDK/project not configured.");
    }

    public static class AccountHubPolicy
    {
        public static bool Equivalent(HubProgress a, HubProgress b) =>
            JsonUtility.ToJson(a) == JsonUtility.ToJson(b);

        public static HubProgress Clone(HubProgress input) =>
            input == null ? null : JsonUtility.FromJson<HubProgress>(JsonUtility.ToJson(input));

        /// <summary>Only for a verified SAME UID (or a one-time newly created account guest claim).
        /// All stage/score fields remain non-authoritative preview; never use for real prizes or IAP.
        /// </summary>
        public static HubProgress Merge(HubProgress remote, HubProgress local)
        {
            if (remote == null) return Clone(local) ?? new HubProgress();
            if (local == null) return Clone(remote);
            HubProgress merged = Clone(remote);
            merged.CompletedStages = Mathf.Max(remote.CompletedStages, local.CompletedStages);
            merged.LastStoryChapterShown = Mathf.Max(remote.LastStoryChapterShown, local.LastStoryChapterShown);
            // Daily counters may overlap across devices: never add unverified totals or create spendable rewards.
            if (local.MissionUtcDayTicks > remote.MissionUtcDayTicks ||
                (local.MissionUtcDayTicks == remote.MissionUtcDayTicks && local.LastSavedUtcTicks > remote.LastSavedUtcTicks))
            {
                merged.MissionUtcDayTicks = local.MissionUtcDayTicks;
                merged.MissionRuns = local.MissionRuns;
                merged.MissionCoins = local.MissionCoins;
                merged.MissionDistanceMetres = local.MissionDistanceMetres;
            }
            merged.FinishedRuns = Mathf.Max(remote.FinishedRuns, local.FinishedRuns); // not sum: replay-safe
            merged.BestRunMeters = Mathf.Max(remote.BestRunMeters, local.BestRunMeters);
            if (local.LastSavedUtcTicks > remote.LastSavedUtcTicks)
            {
                merged.Position = local.Position;
                merged.LastDoor = local.LastDoor;
                merged.SelectedOutfit = local.SelectedOutfit;
                merged.Options = local.Options;
                merged.SelectedCharacter = local.SelectedCharacter;
                merged.LastRunMeters = local.LastRunMeters;
                merged.LastSavedUtcTicks = local.LastSavedUtcTicks;
            }
            return merged;
        }
    }
}
