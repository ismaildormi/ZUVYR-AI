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
        public AuthTokens tokens;
        public string error;

        public static AuthResult Ok(PlayerProfile p, AuthTokens t = null) =>
            new AuthResult { success = true, profile = p, tokens = t };
        public static AuthResult Fail(string message) =>
            new AuthResult { success = false, error = message };
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
    /// <see cref="UnityWebRequest"/> — no external plugins required. The
    /// returned <see cref="AuthTokens"/> carry the Firebase ID token (needed to
    /// authenticate RTDB requests), the refresh token, and the stable UID.
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

        [Serializable] private class RefreshRequest
        {
            public string refreshToken;
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
            public string expiresIn = null; // seconds, on refresh
        }

        /// <summary>
        /// Exchanges a Google ID token for a Firebase identity. Flow:
        /// Google ID token -> Firebase <c>signInWithIdToken</c> -> Firebase
        /// ID token (the token RTDB rules authenticate against).
        /// </summary>
        public static Task<AuthTokens> SignInWithGoogleAsync(string googleIdToken, FirebaseConfig config)
        {
            string url =
                "https://identitytoolkit.googleapis.com/v1/accounts/signInWithIdToken" +
                "?key=" + Uri.EscapeDataString(config.webApiKey);
            string body = JsonUtility.ToJson(new SignInWithIdTokenRequest
            {
                idToken = googleIdToken,
                requestUri = config.requestUri
            });
            return PostAsync(url, body).ContinueWith(t => Map(t.Result, "google"));
        }

        /// <summary>Creates (or signs in) an anonymous Firebase user.</summary>
        public static Task<AuthTokens> SignInAnonymousAsync(FirebaseConfig config)
        {
            string url =
                "https://identitytoolkit.googleapis.com/v1/accounts:signUp" +
                "?key=" + Uri.EscapeDataString(config.webApiKey);
            string body = JsonUtility.ToJson(new SignUpRequest { returnSecureToken = true });
            return PostAsync(url, body).ContinueWith(t => Map(t.Result, "anonymous"));
        }

        /// <summary>
        /// Exchanges a refresh token for a fresh Firebase ID token. Used to keep
        /// sessions alive without re-prompting the player; expiry/refresh is
        /// handled here rather than letting expired ID tokens fail silently.
        /// </summary>
        public static Task<AuthTokens> RefreshTokenAsync(string refreshToken, FirebaseConfig config)
        {
            string url =
                "https://securetoken.googleapis.com/v1/accounts/refreshToken" +
                "?key=" + Uri.EscapeDataString(config.webApiKey);
            string body = JsonUtility.ToJson(new RefreshRequest { refreshToken = refreshToken });
            return PostAsync(url, body).ContinueWith(t => Map(t.Result, "refresh"));
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

        private static AuthTokens Map(FirebaseAuthResponse r, string provider)
        {
            if (r == null || string.IsNullOrEmpty(r.idToken))
                throw new InvalidOperationException("Empty Firebase Auth response.");

            AuthTokens tokens = new AuthTokens
            {
                idToken = r.idToken,
                refreshToken = r.refreshToken,
                localId = r.localId,
                displayName = r.displayName,
                email = r.email,
                photoUrl = r.photoUrl,
                provider = provider
            };

            tokens.expiresAt = DecodeExp(r.idToken);
            if (tokens.expiresAt <= 0L && !string.IsNullOrEmpty(r.expiresIn)
                && long.TryParse(r.expiresIn, out long seconds))
                tokens.expiresAt = DateTimeOffset.UtcNow.AddSeconds(seconds).ToUnixTimeMilliseconds();

            if (tokens.expiresAt <= 0L)
                tokens.expiresAt = DateTimeOffset.UtcNow.AddHours(1).ToUnixTimeMilliseconds(); // Firebase ID tokens last ~1h

            return tokens;
        }

        /// <summary>
        /// Decodes the JWT <c>exp</c> claim (epoch seconds) from a Firebase ID
        /// token. Returns 0 when the token cannot be decoded.
        /// </summary>
        private static long DecodeExp(string idToken)
        {
            try
            {
                string[] parts = idToken.Split('.');
                if (parts.Length < 2) return 0L;

                string payload = Base64UrlDecode(parts[1]);
                var obj = MiniJson.Parse(payload) as System.Collections.Generic.Dictionary<string, object>;
                if (obj != null && obj.TryGetValue("exp", out object v) && v is double d)
                    return (long)d * 1000L; // seconds -> ms
            }
            catch
            {
                // Fall through; the caller applies the 1-hour default.
            }
            return 0L;
        }

        private static string Base64UrlDecode(string s)
        {
            s = s.Replace('-', '+').Replace('_', '/');
            switch (s.Length % 4)
            {
                case 2: s += "=="; break;
                case 3: s += "="; break;
            }
            return System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(s));
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
                        AuthTokens anon = await FirebaseAuthClient.SignInAnonymousAsync(config);
                        return AuthResult.Ok(anon.ToProfile(), anon);
                    }

                    AuthTokens tokens = await FirebaseAuthClient.SignInWithGoogleAsync(idToken, config);
                    return AuthResult.Ok(tokens.ToProfile(), tokens);
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
