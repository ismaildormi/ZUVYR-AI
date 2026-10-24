#if UFC_FIREBASE
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Firebase;
using Firebase.Auth;
using Firebase.Firestore;
using UnityEngine;
using UltimateFootballChase.Hub;

namespace UltimateFootballChase.Backend
{
    /// <summary>Platform bridge supplies Google's ID token. Never accept an arbitrary player-entered UID.</summary>
    public interface IGoogleTokenProvider { Task<string> GetIdTokenAsync(); }
    public static class GoogleTokenBridge { public static IGoogleTokenProvider Provider { get; set; } }

    internal sealed class FirebaseAuthGateway : IAccountAuthGateway
    {
        private FirebaseAuth auth;
        public bool IsConfigured => true; // SDK compiled; Firebase dependency/credentials are checked at sign-in.
        private async Task<FirebaseAuth> ReadyAsync()
        {
            DependencyStatus state = await FirebaseApp.CheckAndFixDependenciesAsync();
            if (state != DependencyStatus.Available)
                throw new InvalidOperationException("Firebase dependencies unavailable: " + state);
            if (auth == null) auth = FirebaseAuth.DefaultInstance;
            return auth;
        }
        private static AccountIdentity Identity(FirebaseUser user, string provider) =>
            user == null ? null : new AccountIdentity(user.UserId, provider);
        public async Task<AccountIdentity> RestoreAsync()
        {
            FirebaseAuth current = await ReadyAsync();
            // Firebase retains the native session. No anonymous auth, simulated login, or editable UID.
            return Identity(current.CurrentUser, "restored Firebase session");
        }
        public async Task<AccountIdentity> GoogleAsync()
        {
            if (GoogleTokenBridge.Provider == null)
                throw new InvalidOperationException("Google token bridge unavailable; import/configure Google Sign-In for Unity.");
            string token = await GoogleTokenBridge.Provider.GetIdTokenAsync();
            if (string.IsNullOrWhiteSpace(token)) throw new InvalidOperationException("Google returned no ID token");
            FirebaseAuth current = await ReadyAsync();
            return Identity(await current.SignInWithCredentialAsync(GoogleAuthProvider.GetCredential(token, null)),
                "Google");
        }
        public async Task<AccountIdentity> AppleAsync()
        {
            if (Application.platform != RuntimePlatform.IPhonePlayer)
                throw new NotSupportedException("Apple ID sign-in is available only on a configured iOS device");
            FirebaseAuth current = await ReadyAsync();
            var provider = new FederatedOAuthProvider(new FederatedOAuthProviderData { ProviderId = "apple.com" });
            return Identity((await current.SignInWithProviderAsync(provider)).User, "Apple ID");
        }
        public async Task<AccountIdentity> GameCenterAsync()
        {
            if (Application.platform != RuntimePlatform.IPhonePlayer)
                throw new NotSupportedException("Game Center sign-in is available only on a configured iOS device");
            FirebaseAuth current = await ReadyAsync();
            var credential = await GameCenterAuthProvider.GetCredentialAsync();
            return Identity(await current.SignInWithCredentialAsync(credential), "Game Center");
        }
        public async Task SignOutAsync() { (await ReadyAsync()).SignOut(); }
    }

    /// <summary>Only the current Firebase user's private, NON-AUTHORITATIVE Hub preview document.</summary>
    internal sealed class FirebaseHubStore : ICloudHubStore
    {
        private static DocumentReference Document(string uid)
        {
            if (string.IsNullOrEmpty(uid) || FirebaseAuth.DefaultInstance.CurrentUser?.UserId != uid)
                throw new InvalidOperationException("Authenticated Firebase UID mismatch");
            return FirebaseFirestore.DefaultInstance.Collection("hubPreviews").Document(uid);
        }
        public async Task<HubProgress> FetchAsync(string uid)
        {
            // Server-only read: an empty offline cache MUST NOT be mistaken for a missing account.
            var snapshot = await Document(uid).GetSnapshotAsync(Source.Server);
            if (!snapshot.Exists) return null;
            if (snapshot.GetValue<long>("schema") != 1)
                throw new InvalidOperationException("Unsupported Hub cloud schema");
            var value = HubProgressSanitizer.Clean(JsonUtility.FromJson<HubProgress>(snapshot.GetValue<string>("payload")));
            if (value == null) throw new InvalidOperationException("Hub cloud profile is invalid");
            return value;
        }
        public async Task SaveAsync(string uid, HubProgress progress)
        {
            var clean = HubProgressSanitizer.Clean(AccountHubPolicy.Clone(progress));
            if (clean == null) throw new InvalidOperationException("Invalid Hub profile");
            string payload = JsonUtility.ToJson(clean);
            var doc = Document(uid);
            await doc.SetAsync(new Dictionary<string, object> { { "schema", 1 }, { "payload", payload } });
            // A local Firestore write can complete offline. Verify it was read back from SERVER
            // before showing CLOUD SYNCED or marking the one-time guest claim.
            var confirmed = await Document(uid).GetSnapshotAsync(Source.Server);
            if (!confirmed.Exists || confirmed.GetValue<string>("payload") != payload)
                throw new InvalidOperationException("Cloud write not confirmed by server");
        }
    }
}
#endif
