using System; using System.IO; using UnityEngine;
namespace Velox.Auth
{
    /// <summary>
    /// OAuth/backend configuration for VELOX. Resolution order (later wins):
    ///   1) values on this ScriptableObject asset (non-secret IDs only),
    ///   2) external text file `StreamingAssets/velox-auth.json` (git-ignored, per-machine/per-CI),
    ///   3) environment variables (CI / Editor): VELOX_GOOGLE_WEB_CLIENT_ID, VELOX_GOOGLE_ANDROID_CLIENT_ID,
    ///      VELOX_GOOGLE_IOS_CLIENT_ID, VELOX_FIREBASE_AUTH_ENDPOINT, VELOX_BACKEND_BASE_URL.
    /// Secrets never live here: the backend session secret stays server-side; client IDs are public identifiers.
    /// </summary>
    [CreateAssetMenu(fileName = "VeloxAuthConfig", menuName = "VELOX/Auth/Auth Config")]
    public sealed class VeloxAuthConfig : ScriptableObject
    {
        [Header("Google OAuth client IDs (public identifiers, not secrets)")]
        [SerializeField] private string googleWebClientId = "";
        [SerializeField] private string googleAndroidClientId = "";
        [SerializeField] private string googleIosClientId = "";
        [Header("Endpoints")]
        [SerializeField] private string firebaseAuthEndpoint = "";   // e.g. https://identitytoolkit.googleapis.com/v1
        [SerializeField] private string backendBaseUrl = "https://api.zuvyr.example/velox";
        public string GoogleWebClientId => googleWebClientId;
        public string FirebaseAuthEndpoint => firebaseAuthEndpoint;
        public string BackendBaseUrl => backendBaseUrl;
        public string PlatformClientId =>
#if UNITY_ANDROID
            googleAndroidClientId;
#elif UNITY_IOS
            googleIosClientId;
#else
            googleWebClientId;
#endif
        [Serializable] private sealed class FileDto { public string googleWebClientId, googleAndroidClientId, googleIosClientId, firebaseAuthEndpoint, backendBaseUrl; }

        /// <summary>Call once at boot (AuthService.Awake does). Safe no-op when no file/env is present.</summary>
        public void ApplyRuntimeOverrides()
        {
            try
            { string path = Path.Combine(Application.streamingAssetsPath, "velox-auth.json");
              if (File.Exists(path)) Apply(JsonUtility.FromJson<FileDto>(File.ReadAllText(path))); }
            catch (Exception e) { Debug.LogWarning("[VELOX] velox-auth.json unreadable: " + e.Message); }
            Apply(new FileDto {
                googleWebClientId = Env("VELOX_GOOGLE_WEB_CLIENT_ID"), googleAndroidClientId = Env("VELOX_GOOGLE_ANDROID_CLIENT_ID"),
                googleIosClientId = Env("VELOX_GOOGLE_IOS_CLIENT_ID"), firebaseAuthEndpoint = Env("VELOX_FIREBASE_AUTH_ENDPOINT"),
                backendBaseUrl = Env("VELOX_BACKEND_BASE_URL") });
        }
        private void Apply(FileDto d) { if (d == null) return;
            if (!string.IsNullOrWhiteSpace(d.googleWebClientId)) googleWebClientId = d.googleWebClientId.Trim();
            if (!string.IsNullOrWhiteSpace(d.googleAndroidClientId)) googleAndroidClientId = d.googleAndroidClientId.Trim();
            if (!string.IsNullOrWhiteSpace(d.googleIosClientId)) googleIosClientId = d.googleIosClientId.Trim();
            if (!string.IsNullOrWhiteSpace(d.firebaseAuthEndpoint)) firebaseAuthEndpoint = d.firebaseAuthEndpoint.Trim();
            if (!string.IsNullOrWhiteSpace(d.backendBaseUrl)) backendBaseUrl = d.backendBaseUrl.Trim(); }
        private static string Env(string k) { try { return Environment.GetEnvironmentVariable(k); } catch { return null; } }
#if UNITY_EDITOR
        /// <summary>Editor-only: bake current env vars into the asset (used by the automated scene builder).</summary>
        public void BakeFromEnvironmentInEditor() { ApplyRuntimeOverrides(); UnityEditor.EditorUtility.SetDirty(this); }
#endif
    }
}
