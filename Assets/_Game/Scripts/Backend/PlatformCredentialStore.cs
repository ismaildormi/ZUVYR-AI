#if UNITY_IOS || UNITY_ANDROID
using System;
using System.Text;
using System.Threading.Tasks;
using UnityEngine;

namespace VELOX.Backend
{
    /// <summary>
    /// Production secure credential store for the Firebase refresh token.
    ///
    /// ANDROID — Android Keystore-backed AES-GCM encryption. A 256-bit AES key
    /// is generated inside the Keystore (it never leaves secure hardware / the
    /// Keystore provider); the refresh token is encrypted with AES-GCM and the
    /// resulting IV+ciphertext blob is stored in SharedPreferences (useless
    /// without the Keystore key). Key alias: "velox.account.refresh".
    ///
    /// IOS — native Keychain (Security framework) via a P/Invoke to a small
    /// native plugin (see VELOXKeychain.c / .mm). The native side MUST be
    /// compiled into the app; this file is the C# integration contract.
    /// Service: "velox.account", account: "refresh".
    ///
    /// UNVERIFIED IN THIS SANDBOX: neither the Android Keystore nor the iOS
    /// Keychain path is compiled or tested here (no iOS/Android toolchain in
    /// the offline harness). The AccountSession / CredentialPersistence logic
    /// is verified against MemoryCredentialStore; the native integration
    /// requires on-device verification. See the status table in firebase/README.md.
    /// </summary>
    public class PlatformCredentialStore : ICredentialStore
    {
        private const string KeyAlias = "velox.account.refresh";
        private const string IosService = "velox.account";
        private const string IosAccount = "refresh";
        private const int GcmIvLength = 12; // bytes

        // ---- iOS Keychain P/Invoke (native plugin) ----
#if UNITY_IOS
        [DllImport("__Internal")] private static extern int VELOX_KeychainStore(string service, string account, byte[] data, int dataLen);
        [DllImport("__Internal")] private static extern int VELOX_KeychainRetrieve(string service, string account, out byte[] data, out int dataLen);
        [DllImport("__Internal")] private static extern int VELOX_KeychainDelete(string service, string account);
#endif

        public bool IsSecureStorageAvailable
        {
            get
            {
#if UNITY_ANDROID
                return Application.isPlatformEnabled(BuildTarget.Android);
#elif UNITY_IOS
                return Application.isPlatformEnabled(BuildTarget.iOS);
#else
                return false;
#endif
            }
        }

        public Task<bool> StoreAsync(string key, string value)
        {
            if (!IsSecureStorageAvailable) return Task.FromResult(false);
#if UNITY_ANDROID
            return StoreAndroidAsync(value);
#elif UNITY_IOS
            return StoreIosAsync(value);
#else
            return Task.FromResult(false);
#endif
        }

        public Task<string> RetrieveAsync(string key)
        {
            if (!IsSecureStorageAvailable) return Task.FromResult<string>(null);
#if UNITY_ANDROID
            return RetrieveAndroidAsync();
#elif UNITY_IOS
            return RetrieveIosAsync();
#else
            return Task.FromResult<string>(null);
#endif
        }

        public Task<bool> RemoveAsync(string key)
        {
            if (!IsSecureStorageAvailable) return Task.FromResult(false);
#if UNITY_ANDROID
            return RemoveAndroidAsync();
#elif UNITY_IOS
            return RemoveIosAsync();
#else
            return Task.FromResult(false);
#endif
        }

        // ---- Android Keystore (AES-GCM, key in Keystore) ----
#if UNITY_ANDROID
        private static Task<bool> StoreAndroidAsync(string plaintext)
        {
            try
            {
                using (var keyStore = new AndroidJavaObject("java.security.KeyStore"))
                {
                    keyStore.CallStatic("load", (object)null);
                    if (!IsKeyPresent(keyStore))
                        GenerateKey(keyStore);

                    AndroidJavaObject cipher = CreateEncryptCipher(keyStore);
                    byte[] iv = cipher.Call<byte[]>("getIV");
                    byte[] cipherText = cipher.Call<byte[]>("doFinal", Encoding.UTF8.GetBytes(plaintext));

                    string blob = Android.Runtime.Convert.ToBase64(Concat(iv, cipherText));
                    SetSharedPref(KeyAlias, blob);
                    return Task.FromResult(true);
                }
            }
            catch (Exception e)
            {
                // Keystore failure (key unavailable, cipher error, etc.). Do NOT
                // fall back to plaintext. Log without exposing the token value.
                Debug.LogError("[VELOX] Android Keystore store failed: " + e.Message);
                return Task.FromResult(false);
            }
        }

        private static Task<string> RetrieveAndroidAsync()
        {
            string blob = GetSharedPref(KeyAlias);
            if (string.IsNullOrEmpty(blob)) return Task.FromResult<string>(null);

            try
            {
                byte[] combined = Android.Runtime.Convert.FromBase64(blob);
                if (combined.Length <= GcmIvLength) return Task.FromResult<string>(null);

                byte[] iv = new byte[GcmIvLength];
                byte[] cipherText = new byte[combined.Length - GcmIvLength];
                Array.Copy(combined, 0, iv, 0, GcmIvLength);
                Array.Copy(combined, GcmIvLength, cipherText, 0, cipherText.Length);

                using (var keyStore = new AndroidJavaObject("java.security.KeyStore"))
                {
                    keyStore.CallStatic("load", (object)null);
                    AndroidJavaObject cipher = CreateDecryptCipher(keyStore, iv);
                    byte[] plain = cipher.Call<byte[]>("doFinal", cipherText);
                    return Task.FromResult(Encoding.UTF8.GetString(plain));
                }
            }
            catch (Exception e)
            {
                // Corrupted blob, wrong key, or tampered ciphertext. Do NOT fall
                // back to plaintext. Return null (forces re-login).
                Debug.LogError("[VELOX] Android Keystore decrypt failed (corrupted data?): " + e.Message);
                return Task.FromResult<string>(null);
            }
        }

        private static Task<bool> RemoveAndroidAsync()
        {
            try
            {
                using (var keyStore = new AndroidJavaObject("java.security.KeyStore"))
                {
                    keyStore.CallStatic("load", (object)null);
                    keyStore.Call("deleteAlias", KeyAlias);
                }
            }
            catch (Exception e)
            {
                // Keystore delete failed — the key may already be gone (reinstall)
                // or the Keystore is in an inconsistent state. Continue to clear
                // the SharedPreferences blob but report the Keystore failure.
                Debug.LogError("[VELOX] Android Keystore deleteAlias failed: " + e.Message);
            }

            // Remove the ciphertext blob from SharedPreferences (use remove(), not
            // putString(""), so the key is fully deleted rather than left empty).
            try
            {
                AndroidJavaObject activity = GetActivity();
                AndroidJavaObject prefs = activity.Call<AndroidJavaObject>("getSharedPreferences", "velox_secure", 0);
                prefs.Call("edit").Call("remove", KeyAlias).Call("commit");
            }
            catch (Exception e)
            {
                Debug.LogError("[VELOX] Android SharedPreferences remove failed: " + e.Message);
                return Task.FromResult(false);
            }

            return Task.FromResult(true);
        }

        private static bool IsKeyPresent(AndroidJavaObject keyStore)
        {
            return keyStore.Call<bool>("containsAlias", KeyAlias);
        }

        private static void GenerateKey(AndroidJavaObject keyStore)
        {
            // KeyGenParameterSpec via its Builder: ENCRYPT|DECRYPT, AES, GCM,
            // NoPadding, 256-bit, key inside AndroidKeyStore.
            var builder = new AndroidJavaObject(
                "android.security.keystore.KeyGenParameterSpec.Builder",
                KeyAlias,
                3 /* PURPOSE_ENCRYPT | PURPOSE_DECRYPT */,
                new string[] { "GCM" },
                new string[] { "NoPadding" });
            builder.Call("setKeySize", 256);
            AndroidJavaObject spec = builder.Call<AndroidJavaObject>("build");

            AndroidJavaObject keyGen = new AndroidJavaObject("java.security.KeyGenerator");
            keyGen.CallStatic("getInstance", "AES", "AndroidKeyStore");
            keyGen.Call("init", spec);
            keyGen.Call("generateKey", KeyAlias);
        }

        private static AndroidJavaObject CreateEncryptCipher(AndroidJavaObject keyStore)
        {
            AndroidJavaObject cipher = new AndroidJavaObject("javax.crypto.Cipher");
            cipher.CallStatic("getInstance", "AES/GCM/NoPadding", "AndroidKeyStore");
            AndroidJavaObject key = keyStore.Call<AndroidJavaObject>("getKey", KeyAlias, (object)null);
            cipher.Call("init", 2 /* ENCRYPT_MODE */, key);
            return cipher;
        }

        private static AndroidJavaObject CreateDecryptCipher(AndroidJavaObject keyStore, byte[] iv)
        {
            AndroidJavaObject cipher = new AndroidJavaObject("javax.crypto.Cipher");
            cipher.CallStatic("getInstance", "AES/GCM/NoPadding", "AndroidKeyStore");
            AndroidJavaObject key = keyStore.Call<AndroidJavaObject>("getKey", KeyAlias, (object)null);
            // GCMParameterSpec(tagLengthBits=128, iv)
            AndroidJavaObject gcmSpec = new AndroidJavaObject(
                "javax.crypto.spec.GCMParameterSpec", 128, iv);
            cipher.Call("init", 3 /* DECRYPT_MODE */, key, gcmSpec);
            return cipher;
        }

        private static void SetSharedPref(string key, string value)
        {
            AndroidJavaObject activity = GetActivity();
            AndroidJavaObject prefs = activity.Call<AndroidJavaObject>("getSharedPreferences", "velox_secure", 0);
            prefs.Call("edit").Call("putString", key, value).Call("commit");
        }

        private static string GetSharedPref(string key)
        {
            AndroidJavaObject activity = GetActivity();
            AndroidJavaObject prefs = activity.Call<AndroidJavaObject>("getSharedPreferences", "velox_secure", 0);
            return prefs.Call<string>("getString", key, null);
        }

        private static AndroidJavaObject GetActivity()
        {
            AndroidJavaClass unityPlayer = new AndroidJavaClass("com.unity3d.player.UnityPlayer");
            return unityPlayer.GetStatic<AndroidJavaObject>("currentActivity");
        }

        private static byte[] Concat(byte[] a, byte[] b)
        {
            byte[] r = new byte[a.Length + b.Length];
            Array.Copy(a, 0, r, 0, a.Length);
            Array.Copy(b, 0, r, a.Length, b.Length);
            return r;
        }
#endif

        // ---- iOS Keychain (native plugin P/Invoke) ----
#if UNITY_IOS
        private static Task<bool> StoreIosAsync(string value)
        {
            try
            {
                byte[] data = Encoding.UTF8.GetBytes(value);
                int rc = VELOX_KeychainStore(IosService, IosAccount, data, data.Length);
                return Task.FromResult(rc == 0);
            }
            catch (Exception e)
            {
                // Native plugin missing, Keychain failure, or marshalling error.
                // Do NOT fall back to plaintext.
                Debug.LogError("[VELOX] iOS Keychain store failed: " + e.Message);
                return Task.FromResult(false);
            }
        }

        private static Task<string> RetrieveIosAsync()
        {
            try
            {
                out byte[] data;
                out int len;
                int rc = VELOX_KeychainRetrieve(IosService, IosAccount, out data, out len);
                if (rc != 0 || data == null || len <= 0) return Task.FromResult<string>(null);
                return Task.FromResult(Encoding.UTF8.GetString(data, 0, len));
            }
            catch (Exception e)
            {
                Debug.LogError("[VELOX] iOS Keychain retrieve failed: " + e.Message);
                return Task.FromResult<string>(null);
            }
        }

        private static Task<bool> RemoveIosAsync()
        {
            try
            {
                int rc = VELOX_KeychainDelete(IosService, IosAccount);
                return Task.FromResult(rc == 0);
            }
            catch (Exception e)
            {
                Debug.LogError("[VELOX] iOS Keychain delete failed: " + e.Message);
                return Task.FromResult(false);
            }
        }
#endif
    }
}
#endif
