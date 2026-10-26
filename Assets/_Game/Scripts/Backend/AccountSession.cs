using System;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;

namespace VELOX.Backend
{
    /// <summary>
    /// Session manager for player accounts. Wraps <see cref="IAuthProvider"/> to
    /// offer Google (Gmail) sign-in and anonymous sign-in, persists the active
    /// profile locally and raises events the UI can subscribe to.
    ///
    /// Holds the Firebase ID token (authenticates RTDB requests) and refresh
    /// token. Token refresh is handled transparently so expired sessions recover
    /// instead of failing silently.
    /// </summary>
    public class AccountSession : MonoBehaviour
    {
        public static AccountSession Instance { get; private set; }

        [Header("Firebase / Google configuration")]
        public FirebaseConfig firebaseConfig;

        /// <summary>Android/iOS/Web OAuth client id used for Google Sign-In.</summary>
        public string googleWebClientId = string.Empty;

        [Tooltip("Override the default provider (FirebaseGoogleAuthProvider / LocalAuthProvider).")]
        public IAuthProvider AuthProvider;

        public bool HasProfile => _profile != null;
        public PlayerProfile CurrentUser => _profile;

        /// <summary>
        /// The Firebase ID token used to authenticate RTDB requests. Empty when
        /// no token is available yet (before sign-in or if refresh is in flight).
        /// </summary>
        public string CurrentIdToken => _tokens != null ? _tokens.idToken : null;

        /// <summary>The Firebase refresh token (empty for offline/local sessions).</summary>
        public string CurrentRefreshToken => _tokens != null ? _tokens.refreshToken : null;

        /// <summary>Raised whenever the signed-in profile changes (null = signed out).</summary>
        public event Action<PlayerProfile> OnProfileChanged;
        /// <summary>Raised when authentication fails.</summary>
        public event Action<string> OnAuthError;
        /// <summary>Raised after any login/logout transition.</summary>
        public event Action OnLoginChanged;

        private PlayerProfile _profile;
        private AuthTokens _tokens;
        private const string Prefix = "VELOX.Account.";

        void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Debug.LogWarning("[VELOX] AccountSession already exists; destroying duplicate.");
                Destroy(gameObject);
                return;
            }

            Instance = this;
            DontDestroyOnLoad(gameObject);
        }

        void Start()
        {
            RestoreSession();
        }

        /// <summary>Sign in with the configured Google web client id.</summary>
        public Task<bool> LoginWithGoogleAsync(CancellationToken cancellationToken = default) =>
            LoginWithGoogleAsync(googleWebClientId, cancellationToken);

        /// <summary>Sign in with an explicit Google web client id.</summary>
        public async Task<bool> LoginWithGoogleAsync(string webClientId, CancellationToken cancellationToken = default)
        {
            AuthResult result = await ResolveProvider().AuthenticateAsync(
                new AuthRequest
                {
                    mode = AuthMode.Google,
                    webClientId = webClientId,
                    config = firebaseConfig
                },
                cancellationToken);

            return ApplyResult(result);
        }

        /// <summary>Sign in anonymously (no Google account required).</summary>
        public async Task<bool> LoginAnonymousAsync(CancellationToken cancellationToken = default)
        {
            AuthResult result = await ResolveProvider().AuthenticateAsync(
                new AuthRequest
                {
                    mode = AuthMode.Anonymous,
                    config = firebaseConfig
                },
                cancellationToken);

            return ApplyResult(result);
        }

        /// <summary>
        /// Ensures the ID token is usable (not expired), refreshing it via the
        /// refresh token when necessary. Returns true when a valid token exists.
        /// </summary>
        public async Task<bool> EnsureFreshTokenAsync()
        {
            if (_tokens == null) return false;

            long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            if (string.IsNullOrEmpty(_tokens.idToken) || _tokens.IsExpired(now))
                return await RefreshSessionAsync();

            return true;
        }

        /// <summary>Refreshes the Firebase ID token using the stored refresh token.</summary>
        public async Task<bool> RefreshSessionAsync()
        {
            FirebaseConfig config = firebaseConfig;
            if (_tokens == null || string.IsNullOrEmpty(_tokens.refreshToken) ||
                config == null || !config.enabled)
            {
                return false;
            }

            try
            {
                AuthTokens refreshed = await FirebaseAuthClient.RefreshTokenAsync(_tokens.refreshToken, config);
                ApplyTokens(refreshed);
                Debug.Log("[VELOX] Session token refreshed.");
                return true;
            }
            catch (Exception e)
            {
                Debug.LogError("[VELOX] Token refresh failed: " + e.Message);
                OnAuthError?.Invoke("Session expired and refresh failed: " + e.Message);
                return false;
            }
        }

        public void SignOut()
        {
            _tokens = null;
            _profile = null;
            ClearPersisted();
            OnProfileChanged?.Invoke(null);
            OnLoginChanged?.Invoke();
        }

        private IAuthProvider ResolveProvider()
        {
            if (AuthProvider != null) return AuthProvider;

            bool remoteEnabled = firebaseConfig != null && firebaseConfig.enabled;
            return remoteEnabled ? (IAuthProvider)new FirebaseGoogleAuthProvider() : new LocalAuthProvider();
        }

        private bool ApplyResult(AuthResult result)
        {
            if (result != null && result.success && result.profile != null)
            {
                ApplyProfile(result.profile);
                if (result.tokens != null) ApplyTokens(result.tokens);
                return true;
            }

            string error = result != null && !string.IsNullOrEmpty(result.error)
                ? result.error
                : "Authentication failed.";
            Debug.LogError("[VELOX] " + error);
            OnAuthError?.Invoke(error);
            return false;
        }

        private void ApplyProfile(PlayerProfile profile)
        {
            _profile = profile;
            Persist(profile);
            Debug.Log("[VELOX] Signed in as " + profile.DisplayName + " (id " + profile.localId + ").");
            OnProfileChanged?.Invoke(_profile);
            OnLoginChanged?.Invoke();
        }

        private void ApplyTokens(AuthTokens tokens)
        {
            _tokens = tokens;
            PlayerPrefs.SetString(Prefix + "RefreshToken", tokens.refreshToken ?? string.Empty);
            PlayerPrefs.SetString(Prefix + "LocalId", tokens.localId ?? string.Empty);
            PlayerPrefs.Save();
        }

        private void Persist(PlayerProfile p)
        {
            PlayerPrefs.SetString(Prefix + "LocalId", p.localId ?? string.Empty);
            PlayerPrefs.SetString(Prefix + "DisplayName", p.displayName ?? string.Empty);
            PlayerPrefs.SetString(Prefix + "Email", p.email ?? string.Empty);
            PlayerPrefs.SetString(Prefix + "PhotoUrl", p.photoUrl ?? string.Empty);
            PlayerPrefs.SetString(Prefix + "Provider", p.provider ?? string.Empty);
            PlayerPrefs.Save();
        }

        private void RestoreSession()
        {
            string localId = PlayerPrefs.GetString(Prefix + "LocalId", string.Empty);
            string refreshToken = PlayerPrefs.GetString(Prefix + "RefreshToken", string.Empty);

            if (!string.IsNullOrEmpty(refreshToken))
                _tokens = new AuthTokens { refreshToken = refreshToken, localId = localId };

            if (string.IsNullOrEmpty(localId)) return;

            _profile = new PlayerProfile
            {
                localId = localId,
                displayName = PlayerPrefs.GetString(Prefix + "DisplayName", string.Empty),
                email = PlayerPrefs.GetString(Prefix + "Email", string.Empty),
                photoUrl = PlayerPrefs.GetString(Prefix + "PhotoUrl", string.Empty),
                provider = PlayerPrefs.GetString(Prefix + "Provider", string.Empty)
            };

            OnProfileChanged?.Invoke(_profile);
            OnLoginChanged?.Invoke();

            // Refresh the ID token in the background so RTDB requests can authenticate.
            if (!string.IsNullOrEmpty(refreshToken))
                _ = RefreshSessionAsync();
        }

        private void ClearPersisted()
        {
            PlayerPrefs.DeleteKey(Prefix + "LocalId");
            PlayerPrefs.DeleteKey(Prefix + "DisplayName");
            PlayerPrefs.DeleteKey(Prefix + "Email");
            PlayerPrefs.DeleteKey(Prefix + "PhotoUrl");
            PlayerPrefs.DeleteKey(Prefix + "Provider");
            PlayerPrefs.DeleteKey(Prefix + "RefreshToken");
            PlayerPrefs.Save();
        }

        void OnDestroy()
        {
            if (Instance == this) Instance = null;
        }
    }
}
