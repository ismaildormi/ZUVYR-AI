using System;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.Networking;

namespace VELOX.Backend
{
    /// <summary>How a sign-in request should be fulfilled.</summary>
    public enum AuthMode
    {
        Google,
        Anonymous
    }

    /// <summary>Inputs required to authenticate a player.</summary>
    [Serializable]
    public class AuthRequest
    {
        public AuthMode mode = AuthMode.Google;
        public string webClientId = string.Empty;
        public FirebaseConfig config;
    }

    /// <summary>Outcome of an authentication attempt.</summary>
    public class AuthResult
    {
        public bool success;
        public PlayerProfile profile;
        public string error;

        public static AuthResult Ok(PlayerProfile p) => new AuthResult { success = true, profile = p };
        public static AuthResult Fail(string message) => new AuthResult { success = false, error = message };
    }

    /// <summary>
    /// Authentication backend abstraction. Implementations exchange Google
    /// credentials / anonymous sign-ups for a Firebase identity.
    /// </summary>
    public interface IAuthProvider
    {
        string ProviderName { get; }
        Task<AuthResult> AuthenticateAsync(AuthRequest request, CancellationToken cancellationToken = default);
    }

    /// <summary>
    /// Minimal Firebase Auth REST client. Exchanges a Google ID token (or a
    /// fresh anonymous sign-up) for a Firebase identity using only
    /// <see cref="UnityWebRequest"/> — no external plugins required.
    /// </summary>
    public static class FirebaseAuthClient
    {
        [Serializable] private class SignInWithIdTokenRequest
        {
            public string idToken;
            public string requestUri;
        }

        [Serializable] private class SignUpRequest
        {
            public bool returnSecureToken = true;
        }

        [Serializable] private class FirebaseAuthResponse
        {
            public string localId = null;
            public string idToken = null;
            public string refreshToken = null;
            public string email = null;
            public string displayName = null;
            public string photoUrl = null;
        }

        /// <summary>Exchanges a Google ID token for a Firebase user.</summary>
        public static Task<PlayerProfile> SignInWithGoogleAsync(string googleIdToken, FirebaseConfig config)
        {
            string url =
                "https://identitytoolkit.googleapis.com/v1/accounts/signInWithIdToken" +
                "?key=" + Uri.EscapeDataString(config.webApiKey);
            string body = JsonUtility.ToJson(new SignInWithIdTokenRequest
            {
                idToken = googleIdToken,
                requestUri = config.requestUri
            });
            return PostAsync(url, body).ContinueWith(t => Map(t.Result, config));
        }

        /// <summary>Creates (or signs in) an anonymous Firebase user.</summary>
        public static Task<PlayerProfile> SignInAnonymousAsync(FirebaseConfig config)
        {
            string url =
                "https://identitytoolkit.googleapis.com/v1/accounts:signUp" +
                "?key=" + Uri.EscapeDataString(config.webApiKey);
            string body = JsonUtility.ToJson(new SignUpRequest { returnSecureToken = true });
            return PostAsync(url, body).ContinueWith(t => Map(t.Result, config, anonymous: true));
        }

        private static async Task<FirebaseAuthResponse> PostAsync(string url, string body)
        {
            using (UnityWebRequest request = UnityWebRequest.Post(url, "application/json", body))
            {
                var op = request.SendWebRequest();
                while (!op.isDone) await Task.Yield();

                if (request.result != UnityWebRequest.Result.Success)
                {
                    string detail = string.IsNullOrEmpty(request.error)
                        ? request.downloadHandler != null ? request.downloadHandler.text : string.Empty
                        : request.error;
                    throw new InvalidOperationException("Firebase Auth error: " + detail);
                }

                return JsonUtility.FromJson<FirebaseAuthResponse>(request.downloadHandler.text);
            }
        }

        private static PlayerProfile Map(FirebaseAuthResponse r, FirebaseConfig config, bool anonymous = false)
        {
            if (r == null) throw new InvalidOperationException("Empty Firebase Auth response.");

            return new PlayerProfile
            {
                localId = r.localId,
                displayName = r.displayName,
                email = r.email,
                photoUrl = r.photoUrl,
                provider = anonymous ? "anonymous" : "google"
            };
        }
    }

    /// <summary>
    /// Bridge to the native Google Sign-In plugin. When the plugin is present
    /// (and <c>GOOGLE_SIGNIN_PLUGIN</c> is defined) it returns a Google ID token
    /// that <see cref="FirebaseAuthClient"/> exchanges for a Firebase identity.
    /// </summary>
    public static class GoogleSignInClient
    {
        /// <summary>True when the native Google Sign-In plugin is compiled in.</summary>
        public static bool IsPluginAvailable
        {
            get
            {
#if GOOGLE_SIGNIN_PLUGIN
                return true;
#else
                return false;
#endif
            }
        }

        /// <summary>Requests a Google ID token for the given web client id.</summary>
        public static async Task<string> RequestIdTokenAsync(string webClientId)
        {
#if GOOGLE_SIGNIN_PLUGIN
            var user = await Google.SignIn.GoogleSignIn.Instance.RequestAsync();
            return user?.IdToken?.Token;
#else
            throw new InvalidOperationException(
                "Google Sign-In plugin not imported. Add the 'Google Sign-In' Unity package, " +
                "define GOOGLE_SIGNIN_PLUGIN, or fall back to anonymous login.");
#endif
        }
    }

    /// <summary>
    /// Production provider: Google Sign-In (ID token) -> Firebase Auth. Falls
    /// back to an anonymous Firebase sign-up if Google credentials are absent.
    /// </summary>
    public class FirebaseGoogleAuthProvider : IAuthProvider
    {
        public string ProviderName => "firebase-google";

        public async Task<AuthResult> AuthenticateAsync(AuthRequest request, CancellationToken cancellationToken = default)
        {
            FirebaseConfig config = request.config;

            if (config == null || !config.enabled)
                return AuthResult.Fail("Firebase Auth is disabled in configuration.");

            if (config.IsValid(out string reason))
            {
                try
                {
                    string idToken;

                    if (request.mode == AuthMode.Google)
                    {
                        if (!GoogleSignInClient.IsPluginAvailable)
                            return AuthResult.Fail(
                                "Google Sign-In plugin is not available on this build. Use anonymous login or import the plugin.");

                        idToken = await GoogleSignInClient.RequestIdTokenAsync(request.webClientId);
                        if (string.IsNullOrEmpty(idToken))
                            return AuthResult.Fail("Google did not return an ID token.");
                    }
                    else
                    {
                        PlayerProfile anon = await FirebaseAuthClient.SignInAnonymousAsync(config);
                        return AuthResult.Ok(anon);
                    }

                    PlayerProfile profile = await FirebaseAuthClient.SignInWithGoogleAsync(idToken, config);
                    return AuthResult.Ok(profile);
                }
                catch (Exception e)
                {
                    return AuthResult.Fail(e.Message);
                }
            }

            return AuthResult.Fail("Firebase configuration invalid: " + reason);
        }
    }

    /// <summary>
    /// Offline provider that fabricates a local identity. Useful for QA and for
    /// builds without a Firebase backend.
    /// </summary>
    public class LocalAuthProvider : IAuthProvider
    {
        public string ProviderName => "local";

        public Task<AuthResult> AuthenticateAsync(AuthRequest request, CancellationToken cancellationToken = default)
        {
            string name = request.mode == AuthMode.Google ? VELOX.Core.GameIdentity.PlayerName : "Guest";
            PlayerProfile profile = new PlayerProfile
            {
                localId = "local-" + Guid.NewGuid().ToString("N").Substring(0, 12),
                displayName = name,
                email = request.mode == AuthMode.Google ? "local@velox.local" : string.Empty,
                provider = request.mode == AuthMode.Google ? "google-local" : "local"
            };
            return Task.FromResult(AuthResult.Ok(profile));
        }
    }
}
