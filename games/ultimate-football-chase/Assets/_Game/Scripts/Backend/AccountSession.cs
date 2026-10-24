using System;
using System.Threading.Tasks;
using UnityEngine;
using UltimateFootballChase.Hub;

namespace UltimateFootballChase.Backend
{
    /// <summary>Firebase-backed when UFC_FIREBASE is enabled; otherwise visibly guest-only and fail-closed.</summary>
    public sealed class AccountSession : MonoBehaviour
    {
        public static AccountSession Instance { get; private set; }
        public event Action<HubProgress> ProfileChanged;
        public event Action<string> StatusChanged;
        private IAccountAuthGateway auth;
        private ICloudHubStore cloud;
        private AccountIdentity identity;
        private HubProgress pending;
        private bool saving, busy, cloudReady, remoteKnown, accountProfileBound;
        private float nextRetry;
        private int epoch;
        private string status = "LOCAL GUEST • CLOUD NOT CONFIGURED";
        public string Status => status;
        public bool IsBusy => busy;
        public bool IsConfigured => auth != null && auth.IsConfigured;
        public bool IsSignedIn => identity != null;
        public bool HasActiveAccountProfile => identity != null && accountProfileBound;
        public bool IsCloudSynced => identity != null && cloudReady && pending == null && !saving;

        public static AccountSession Ensure()
        {
            if (Instance != null) return Instance;
            return new GameObject("Account session — no fake sign-in").AddComponent<AccountSession>();
        }
        private void Awake()
        {
            if (Instance != null && Instance != this) { Destroy(gameObject); return; }
            Instance = this;
            DontDestroyOnLoad(gameObject);
            HubGuestProgress.UseRepository(new LocalGuestHubRepository()); // prevent Editor domain-reload-off account leakage
            auth = BackendFactory.Auth();
            cloud = BackendFactory.Cloud();
            if (auth.IsConfigured) _ = RestoreAsync();
            else SetStatus("LOCAL GUEST • import/configure Firebase to enable sign-in");
        }
        private void OnDestroy() { if (Instance == this) Instance = null; }
        private void SetStatus(string message)
        {
            status = message;
            StatusChanged?.Invoke(message);
        }
        public async Task RestoreAsync()
        {
            if (busy || !auth.IsConfigured) return;
            busy = true;
            SetStatus("RESTORING ACCOUNT…");
            try
            {
                AccountIdentity restored = await auth.RestoreAsync();
                if (restored == null) SetStatus("LOCAL GUEST • sign in to sync Hub");
                else await ActivateAsync(restored);
            }
            catch (Exception ex) { SetStatus("ACCOUNT RESTORE FAILED • local guest only: " + ex.Message); }
            finally { busy = false; }
        }
        public async Task SignInAsync(string provider)
        {
            if (busy) return;
            if (!auth.IsConfigured)
            {
                SetStatus("SIGN-IN UNAVAILABLE • Firebase SDK/project is not configured");
                return;
            }
            if (identity != null)
            {
                SetStatus("SIGN OUT BEFORE SWITCHING ACCOUNTS");
                return;
            }
            busy = true;
            SetStatus("SIGNING IN WITH " + provider.ToUpperInvariant() + "…");
            try
            {
                AccountIdentity signedIn;
                switch (provider)
                {
                    case "google": signedIn = await auth.GoogleAsync(); break;
                    case "apple": signedIn = await auth.AppleAsync(); break;
                    case "gamecenter": signedIn = await auth.GameCenterAsync(); break;
                    default: throw new NotSupportedException("Unknown sign-in provider");
                }
                if (signedIn == null) throw new InvalidOperationException("Provider returned no Firebase user");
                await ActivateAsync(signedIn);
            }
            catch (Exception ex) { SetStatus("SIGN-IN/CLOUD FAILED • " + ex.Message); }
            finally { busy = false; }
        }
        private async Task ActivateAsync(AccountIdentity user)
        {
            int thisEpoch = ++epoch;
            identity = user;
            accountProfileBound = false;
            cloudReady = false;
            remoteKnown = false;
            pending = null;
            var accountCache = new AccountLocalStorage(user.Uid);
            HubProgress remote;
            try { remote = await WithCloudTimeout(cloud.FetchAsync(user.Uid)); }
            catch (Exception ex)
            {
                if (epoch != thisEpoch) return;
                HubProgress cached = accountCache.Load();
                if (cached != null)
                {
                    Bind(accountCache, cached);
                    SetStatus("OFFLINE ACCOUNT CACHE • NOT SYNCED (" + ex.Message + ")");
                }
                else
                {
                    // Do not guess a missing remote document and do not import guest on network failure.
                    SetStatus("SIGNED IN • CLOUD UNAVAILABLE • GUEST NOT IMPORTED");
                    nextRetry = Time.unscaledTime + 15f;
                }
                return;
            }
            if (epoch != thisEpoch) return;
            remoteKnown = true;
            HubProgress cache = accountCache.Load();
            HubProgress profile;
            if (remote != null)
            {
                profile = AccountHubPolicy.Merge(remote, cache); // same UID's cache only
                if (GuestClaimMarker.ReservedFor(user.Uid)) GuestClaimMarker.MarkClaimed(user.Uid);
                cloudReady = true;
            }
            else
            {
                // Confirmed not found: claim guest ONCE, only after remote creation succeeds.
                bool useGuest = cache == null && GuestClaimMarker.CanClaim(user.Uid);
                profile = cache ?? (useGuest ? new LocalGuestHubRepository().Load() : new HubProgress());
                if (useGuest && !GuestClaimMarker.ReservedFor(user.Uid)) GuestClaimMarker.Reserve(user.Uid);
                try
                {
                    await WithCloudTimeout(cloud.SaveAsync(user.Uid, profile));
                    if (epoch != thisEpoch) return;
                    if (GuestClaimMarker.ReservedFor(user.Uid)) GuestClaimMarker.MarkClaimed(user.Uid);
                    cloudReady = true;
                }
                catch (Exception ex)
                {
                    if (epoch == thisEpoch)
                    {
                        remoteKnown = false;
                        nextRetry = Time.unscaledTime + 15f;
                        SetStatus("SIGNED IN • FIRST CLOUD SAVE FAILED • GUEST UNCHANGED: " + ex.Message);
                    }
                    return;
                }
            }
            if (epoch != thisEpoch) return;
            Bind(accountCache, profile);
            if (remote != null && cache != null && !AccountHubPolicy.Equivalent(remote, profile)) QueueCloud(profile); // same-UID offline improvements only
            else SetStatus("CLOUD SYNCED • " + user.Provider);
        }
        private void Bind(AccountLocalStorage cache, HubProgress profile)
        {
            cache.SaveSnapshot(profile);
            HubGuestProgress.UseRepository(new AccountBoundHubRepository(cache, QueueCloud));
            accountProfileBound = true;
            ProfileChanged?.Invoke(AccountHubPolicy.Clone(profile));
        }
        private void QueueCloud(HubProgress value)
        {
            if (identity == null) return;
            pending = AccountHubPolicy.Clone(value);
            cloudReady = false;
            SetStatus("ACCOUNT SAVE PENDING • LOCAL CACHE SAFE");
            if (remoteKnown && !saving) _ = FlushCloudAsync(epoch);
        }
        private async Task FlushCloudAsync(int thisEpoch)
        {
            if (saving || identity == null) return;
            saving = true;
            string uid = identity.Uid;
            try
            {
                while (pending != null && epoch == thisEpoch)
                {
                    HubProgress next = pending;
                    pending = null;
                    try
                    {
                        await WithCloudTimeout(cloud.SaveAsync(uid, next));
                        if (epoch != thisEpoch) return;
                    }
                    catch (Exception ex)
                    {
                        if (epoch != thisEpoch) return;
                        pending = pending == null ? next : AccountHubPolicy.Merge(next, pending);
                        SetStatus("ACCOUNT OFFLINE • SAVE PENDING: " + ex.Message);
                        nextRetry = Time.unscaledTime + 15f;
                        return;
                    }
                }
                if (epoch == thisEpoch)
                {
                    cloudReady = true;
                    SetStatus("CLOUD SYNCED • " + identity.Provider);
                }
            }
            finally
            {
                saving = false;
                if (pending != null && remoteKnown && identity != null && Time.unscaledTime >= nextRetry)
                    _ = FlushCloudAsync(epoch);
            }
        }
        private static async Task<T> WithCloudTimeout<T>(Task<T> operation)
        {
            if (await Task.WhenAny(operation, Task.Delay(TimeSpan.FromSeconds(15))) != operation)
            {
                ObserveLateFailure(operation);
                throw new TimeoutException("Cloud server request timed out");
            }
            return await operation;
        }
        private static async Task WithCloudTimeout(Task operation)
        {
            if (await Task.WhenAny(operation, Task.Delay(TimeSpan.FromSeconds(15))) != operation)
            {
                ObserveLateFailure(operation);
                throw new TimeoutException("Cloud server write timed out");
            }
            await operation;
        }
        private static void ObserveLateFailure(Task operation) =>
            operation.ContinueWith(t => Debug.LogWarning("Late cloud failure: " + t.Exception),
                TaskContinuationOptions.OnlyOnFaulted);
        private void Update()
        {
            if (identity == null || busy || Time.unscaledTime < nextRetry) return;
            if (!remoteKnown && !saving)
            {
                // Never write an offline cache before reading and merging the authenticated server copy.
                nextRetry = Time.unscaledTime + 15f;
                busy = true;
                _ = RetryActivateAsync(identity);
            }
            else if (pending != null && !saving)
            {
                nextRetry = Time.unscaledTime + 15f;
                _ = FlushCloudAsync(epoch);
            }
        }
        private async Task RetryActivateAsync(AccountIdentity user)
        {
            try { await ActivateAsync(user); }
            catch (Exception ex) { SetStatus("CLOUD RETRY FAILED: " + ex.Message); }
            finally { busy = false; }
        }
        public async Task SignOutAsync()
        {
            if (busy) return;
            busy = true;
            ++epoch; // cancel any stale callbacks; account cache keeps unsent changes for next login
            try { await auth.SignOutAsync(); }
            catch (Exception ex)
            {
                SetStatus("SIGN-OUT FAILED • account cache retained: " + ex.Message);
                busy = false;
                _ = RestoreAsync();
                return;
            }
            identity = null;
            accountProfileBound = false;
            pending = null;
            saving = false;
            cloudReady = false;
            remoteKnown = false;
            HubGuestProgress.UseRepository(new LocalGuestHubRepository());
            ProfileChanged?.Invoke(HubGuestProgress.Load());
            SetStatus("LOCAL GUEST • signed out; account cache stays on this device");
            busy = false;
        }
    }

    public static class BackendFactory
    {
        public static IAccountAuthGateway Auth()
        {
#if UFC_FIREBASE
            return new FirebaseAuthGateway();
#else
            return new UnconfiguredAuthGateway();
#endif
        }
        public static ICloudHubStore Cloud()
        {
#if UFC_FIREBASE
            return new FirebaseHubStore();
#else
            return new UnconfiguredCloudStore();
#endif
        }
    }
}
