using System; using UnityEngine;
namespace Velox.Auth
{
    /// <summary>
    /// Google Sign-In bridge. Production path (documented in Docs/GOOGLE_SIGNIN_SETUP.md):
    /// Android = Play Games Services / Credential Manager native plugin exposing `VeloxGoogleAuth.signIn()`
    /// which returns an ID token via UnitySendMessage("GoogleSignInProvider","OnNativeToken", json).
    /// The ID token is NEVER trusted client-side: VeloxBackendClient exchanges it server-side, where the
    /// backend verifies it with Google (audience = our OAuth client id) before issuing a session.
    /// </summary>
    public sealed class GoogleSignInProvider : MonoBehaviour, IVeloxAuthProvider
    {
        [Tooltip("Web OAuth Client ID (also the backend GOOGLE_CLIENT_ID). Not a secret, but keep in one place.")]
        [SerializeField] private string webClientId = "";
        private Action<VeloxUser> ok; private Action<string> fail;
        public bool IsAvailable =>
#if UNITY_ANDROID && !UNITY_EDITOR
            true;
#else
            false;
#endif
        public void SignIn(Action<VeloxUser> onSuccess, Action<string> onError)
        {
            ok=onSuccess; fail=onError;
#if UNITY_ANDROID && !UNITY_EDITOR
            try { using var cls=new AndroidJavaClass("com.zuvyr.velox.auth.VeloxGoogleAuth");
                  cls.CallStatic("signIn", webClientId, gameObject.name, "OnNativeToken", "OnNativeError"); }
            catch(Exception e){ fail?.Invoke("google_plugin_missing: "+e.Message); }
#elif UNITY_EDITOR || DEVELOPMENT_BUILD
            // Editor/dev-only mock so UI flow is testable without a device. Compiled out of release flow by IsAvailable checks in AuthService.
            onSuccess?.Invoke(new VeloxUser{ userId="dev-user", displayName="NEO Tester", email="dev@example.invalid", idToken="DEV_MOCK_TOKEN" });
#else
            onError?.Invoke("google_signin_unavailable_on_this_platform");
#endif
        }
        // Called by the native plugin (UnitySendMessage). Payload: {"idToken":"...","displayName":"...","email":"...","photoUrl":"...","userId":"..."}
        public void OnNativeToken(string json){ try{ var u=JsonUtility.FromJson<VeloxUser>(json); if(string.IsNullOrEmpty(u?.idToken)) throw new Exception("empty_token"); ok?.Invoke(u); }catch(Exception e){ fail?.Invoke("bad_native_payload: "+e.Message); } }
        public void OnNativeError(string msg)=> fail?.Invoke(msg);
        public void SignOut()
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            try { using var cls=new AndroidJavaClass("com.zuvyr.velox.auth.VeloxGoogleAuth"); cls.CallStatic("signOut"); } catch { /* best effort */ }
#endif
        }
    }
}
