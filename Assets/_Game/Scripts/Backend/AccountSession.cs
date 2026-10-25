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

        /// <summary>Raised whenever the signed-in profile changes (null = signed out).</summary>
        public event Action<PlayerProfile> OnProfileChanged;

        /// <summary>Raised when authentication fails.</summary>
        public event Action<string> OnAuthError;

        /// <summary>Raised after any login/logout transition.</summary>
        public event Action OnLoginChanged;

        private PlayerProfile _profile;
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

        public void SignOut()
        {
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
                return true;
            }

            string error = result != null && !string.IsNullOrEmpty(result.error)
                ? result.error
                : "Authentication failed.";
            OnAuthError?.Invoke(error);
            return false;
        }

        private void ApplyProfile(PlayerProfile profile)
        {
            _profile = profile;
            Persist(profile);
            OnProfileChanged?.Invoke(_profile);
            OnLoginChanged?.Invoke();
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
        }

        private void ClearPersisted()
        {
            PlayerPrefs.DeleteKey(Prefix + "LocalId");
            PlayerPrefs.DeleteKey(Prefix + "DisplayName");
            PlayerPrefs.DeleteKey(Prefix + "Email");
            PlayerPrefs.DeleteKey(Prefix + "PhotoUrl");
            PlayerPrefs.DeleteKey(Prefix + "Provider");
            PlayerPrefs.Save();
        }

        void OnDestroy()
        {
            if (Instance == this) Instance = null;
        }
    }
}
