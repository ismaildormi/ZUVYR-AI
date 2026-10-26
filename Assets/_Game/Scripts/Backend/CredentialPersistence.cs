using System;
using System.Threading.Tasks;
using UnityEngine;

namespace VELOX.Backend
{
    /// <summary>
    /// Owns the secure persistence of the Firebase refresh token and the safe
    /// migration off the legacy plaintext PlayerPrefs key. This class is kept
    /// separate from <see cref="AccountSession"/> (a MonoBehaviour) so the
    /// availability, migration, and failure paths are unit-testable without a
    /// Unity lifecycle.
    ///
    /// SECURITY POLICY:
    /// - The refresh token is stored ONLY via <see cref="ICredentialStore"/>
    ///   (platform secure storage). It is NEVER written to PlayerPrefs.
    /// - When secure storage is unavailable, writes are blocked (return false)
    ///   and the legacy plaintext key is NOT used (no silent plaintext fallback).
    /// - Legacy plaintext migration: read the old PlayerPrefs key, write it to
    ///   the verified secure store, re-read to verify, THEN delete the plaintext
    ///   key. If the secure write or verification fails, the plaintext is
    ///   retained and null is returned (success is not claimed).
    /// - Sign-out removes the credential from the secure store and deletes the
    ///   legacy plaintext key.
    /// </summary>
    public class CredentialPersistence
    {
        private const string Prefix = "VELOX.Account.";
        private const string RefreshTokenKey = "RefreshToken";
        private const string StoreKey = "refreshToken"; // key inside ICredentialStore

        private readonly ICredentialStore _store;

        public CredentialPersistence(ICredentialStore store)
        {
            _store = store;
        }

        /// <summary>True when a secure store is available and usable.</summary>
        public bool IsSecureStorageAvailable => _store != null && _store.IsSecureStorageAvailable;

        /// <summary>
        /// Persist the refresh token in secure storage. Returns true only when
        /// durably persisted. When secure storage is unavailable or the write
        /// fails (including a thrown exception), returns false and does NOT
        /// write plaintext.
        /// </summary>
        public async Task<bool> StoreRefreshTokenAsync(string refreshToken)
        {
            if (string.IsNullOrEmpty(refreshToken)) return false;

            if (!IsSecureStorageAvailable)
            {
                // Explicit unsupported/blocked — no plaintext fallback.
                Debug.LogWarning(
                    "[VELOX] Secure credential storage unavailable; refresh token will NOT be " +
                    "persisted (in-memory only for this session). Sign in again after restart.");
                return false;
            }

            bool ok;
            try
            {
                ok = await _store.StoreAsync(StoreKey, refreshToken);
            }
            catch (Exception e)
            {
                Debug.LogError(
                    "[VELOX] Secure credential store write threw; refresh token NOT persisted: " +
                    e.Message);
                return false;
            }

            if (!ok)
            {
                Debug.LogError(
                    "[VELOX] Secure credential store write failed; refresh token NOT persisted.");
            }
            return ok;
        }

        /// <summary>
        /// Load the refresh token. First tries the secure store; if absent,
        /// attempts to migrate the legacy plaintext PlayerPrefs key into the
        /// verified secure store (then deletes the plaintext). Returns null if
        /// no token is available, if migration fails, if the secure store
        /// throws (corrupted data), or if secure storage is unavailable
        /// (blocked — no plaintext fallback).
        /// </summary>
        public async Task<string> LoadRefreshTokenAsync()
        {
            // 1. Secure store.
            if (IsSecureStorageAvailable)
            {
                string secure = null;
                try
                {
                    secure = await _store.RetrieveAsync(StoreKey);
                }
                catch (Exception e)
                {
                    // Corrupted or unreadable secure data. Do NOT fall back to
                    // plaintext — the secure store may hold a newer token that
                    // was tampered with, and using the legacy plaintext would
                    // be a silent plaintext fallback. Return null (forces re-login).
                    Debug.LogError(
                        "[VELOX] Secure credential store read threw (corrupted or unreadable " +
                        "data); refresh token NOT loaded. Re-login required: " + e.Message);
                    return null;
                }
                if (!string.IsNullOrEmpty(secure)) return secure;
            }

            // 2. Legacy plaintext migration.
            string legacy = PlayerPrefs.GetString(Prefix + RefreshTokenKey, string.Empty);
            if (string.IsNullOrEmpty(legacy)) return null;

            if (!IsSecureStorageAvailable)
            {
                // Blocked: secure storage unavailable, do not use plaintext.
                Debug.LogError(
                    "[VELOX] Secure credential storage unavailable; legacy refresh token is " +
                    "blocked and will not be used. Sign in again on a platform with secure storage.");
                return null;
            }

            // Migrate: write to verified secure store, re-read to verify, then
            // delete the plaintext key. On any failure, retain the plaintext
            // (do not claim success, do not delete).
            bool stored = await _store.StoreAsync(StoreKey, legacy);
            if (!stored)
            {
                Debug.LogError(
                    "[VELOX] Refresh token migration to secure store failed; plaintext retained.");
                return null;
            }

            string verified = await _store.RetrieveAsync(StoreKey);
            if (!string.Equals(verified, legacy, StringComparison.Ordinal))
            {
                Debug.LogError(
                    "[VELOX] Refresh token migration verification failed; plaintext retained.");
                return null;
            }

            PlayerPrefs.DeleteKey(Prefix + RefreshTokenKey);
            PlayerPrefs.Save();
            return legacy;
        }

        /// <summary>
        /// Remove the refresh token from the secure store and delete the legacy
        /// plaintext key. Safe to call when secure storage is unavailable.
        /// Returns true only when both the secure store removal and the
        /// plaintext deletion succeeded (or were already absent). Returns false
        /// if the secure store removal threw or failed — the caller must not
        /// claim complete deletion.
        /// </summary>
        public async Task<bool> ClearRefreshTokenAsync()
        {
            bool secureOk = true;
            if (IsSecureStorageAvailable)
            {
                try
                {
                    secureOk = await _store.RemoveAsync(StoreKey);
                }
                catch (Exception e)
                {
                    Debug.LogError(
                        "[VELOX] Secure credential store remove threw during sign-out; " +
                        "refresh token may still be on disk: " + e.Message);
                    secureOk = false;
                }
            }

            PlayerPrefs.DeleteKey(Prefix + RefreshTokenKey);
            PlayerPrefs.Save();

            if (!secureOk)
            {
                Debug.LogError(
                    "[VELOX] Sign-out credential cleanup incomplete: secure store removal failed. " +
                    "The refresh token may still be on disk.");
            }
            return secureOk;
        }
    }
}
