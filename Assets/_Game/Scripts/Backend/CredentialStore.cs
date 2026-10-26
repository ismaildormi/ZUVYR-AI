using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using UnityEngine;

namespace VELOX.Backend
{
    /// <summary>
    /// Abstraction for persistent credential storage. The Firebase refresh token
    /// is a bearer credential that renews the session, so it must NEVER be stored
    /// in plaintext <see cref="PlayerPrefs"/>. Platform implementations use
    /// OS-secure storage: iOS Keychain, Android Keystore
    /// (see <see cref="PlatformCredentialStore"/>).
    ///
    /// When <see cref="IsSecureStorageAvailable"/> is false, <see cref="StoreAsync"/>
    /// returns false (explicit unsupported/blocked). Callers MUST NOT fall back
    /// to plaintext — there is no plaintext fallback.
    /// </summary>
    public interface ICredentialStore
    {
        bool IsSecureStorageAvailable { get; }

        /// <summary>Store a credential value under <paramref name="key"/>.
        /// Returns true only when the value was durably persisted in secure
        /// storage. Returns false when secure storage is unavailable or the
        /// write failed (callers must treat false as "not persisted", never as
        /// "fall back to plaintext").</summary>
        Task<bool> StoreAsync(string key, string value);

        /// <summary>Retrieve a credential value, or null if absent/unavailable.</summary>
        Task<string> RetrieveAsync(string key);

        /// <summary>Remove a credential. Returns true if removed or already absent.</summary>
        Task<bool> RemoveAsync(string key);
    }

    /// <summary>
    /// In-memory credential store for OFFLINE TESTING of AccountSession /
    /// CredentialPersistence logic. It is NOT a production secure store: data
    /// lives only in process memory and is lost on restart. It does NOT encode
    /// with a hard-coded key — it is a test double so the availability,
    /// migration, and failure paths can be verified without a native
    /// Keychain/Keystore. The production store is
    /// <see cref="PlatformCredentialStore"/>.
    /// </summary>
    public class MemoryCredentialStore : ICredentialStore
    {
        public bool IsSecureStorageAvailable { get; set; } = true;

        /// <summary>Test hook: when true, the next StoreAsync fails (simulates a
        /// secure-store write failure) without consuming availability.</summary>
        public bool FailNextStore { get; set; }

        /// <summary>Test hook: when true, StoreAsync throws (simulates a
        /// secure-store crash such as a Keystore exception).</summary>
        public bool ThrowOnStore { get; set; }

        /// <summary>Test hook: when true, RetrieveAsync throws (simulates
        /// corrupted or unreadable stored data).</summary>
        public bool ThrowOnRetrieve { get; set; }

        /// <summary>Test hook: when true, RemoveAsync throws (simulates a
        /// secure-store delete failure).</summary>
        public bool ThrowOnRemove { get; set; }

        public Dictionary<string, string> Data { get; } = new Dictionary<string, string>();

        public Task<bool> StoreAsync(string key, string value)
        {
            if (!IsSecureStorageAvailable) return Task.FromResult(false);
            if (ThrowOnStore) return Task.FromException<bool>(
                new Exception("Simulated secure-store crash on store"));
            if (FailNextStore) { FailNextStore = false; return Task.FromResult(false); }
            Data[key] = value;
            return Task.FromResult(true);
        }

        public Task<string> RetrieveAsync(string key)
        {
            if (!IsSecureStorageAvailable) return Task.FromResult<string>(null);
            if (ThrowOnRetrieve) return Task.FromException<string>(
                new Exception("Simulated secure-store crash on retrieve (corrupted data)"));
            return Task.FromResult(Data.TryGetValue(key, out var v) ? v : null);
        }

        public Task<bool> RemoveAsync(string key)
        {
            if (!IsSecureStorageAvailable) return Task.FromResult(false);
            if (ThrowOnRemove) return Task.FromException<bool>(
                new Exception("Simulated secure-store crash on remove"));
            Data.Remove(key);
            return Task.FromResult(true);
        }
    }

    /// <summary>
    /// Resolves the platform secure credential store. On iOS/Android returns a
    /// <see cref="PlatformCredentialStore"/>; on other platforms returns null
    /// (secure storage unavailable — callers treat null as blocked, no fallback).
    /// </summary>
    public static class CredentialStoreFactory
    {
        public static ICredentialStore Create()
        {
#if UNITY_IOS || UNITY_ANDROID
            return new PlatformCredentialStore();
#else
            return null;
#endif
        }
    }
}
