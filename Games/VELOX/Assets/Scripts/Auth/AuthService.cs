using System; using UnityEngine;
namespace Velox.Auth
{
    public sealed class AuthService : MonoBehaviour
    {
        [SerializeField] private GoogleSignInProvider google; [SerializeField] private VeloxBackendClient backend; [SerializeField] private VeloxAuthConfig authConfig;
        private void Awake(){ authConfig?.ApplyRuntimeOverrides(); } // file (StreamingAssets/velox-auth.json) + VELOX_* env vars
        public VeloxUser CurrentUser { get; private set; } public bool SignedIn => CurrentUser!=null && !string.IsNullOrEmpty(backend.SessionToken);
        public event Action<VeloxUser> SignedInChanged;
        public void SignInWithGoogle(Action<string> onError=null)
        { if(!google){ onError?.Invoke("auth_not_configured"); return; }
          google.SignIn(u => StartCoroutine(backend.ExchangeGoogleToken(u.idToken, s => { CurrentUser=new VeloxUser{userId=s.user.id,displayName=s.user.displayName,email=s.user.email,photoUrl=s.user.photoUrl}; SignedInChanged?.Invoke(CurrentUser); }, e=>onError?.Invoke(e))), e=>onError?.Invoke(e)); }
        public void SignOut(){ google?.SignOut(); backend.ClearSession(); CurrentUser=null; SignedInChanged?.Invoke(null); }
    }
}
