using System; using System.Collections; using UnityEngine; using UnityEngine.Networking;
namespace Velox.Auth
{
    /// <summary>Thin client for the VELOX backend module (Games/VELOX/Backend). Sends the Google ID token once;
    /// afterwards only the short-lived VELOX session token is used. No Google token is ever stored.</summary>
    public sealed class VeloxBackendClient : MonoBehaviour
    {
        [SerializeField] private string baseUrl = "https://api.zuvyr.example/velox"; // set per-environment
        [SerializeField] private VeloxAuthConfig authConfig; // PR-2: file/env-driven config (wins over the field above)
        private string BaseUrl => authConfig && !string.IsNullOrWhiteSpace(authConfig.BackendBaseUrl) ? authConfig.BackendBaseUrl : baseUrl;
        private const string TokenPrefs = "velox.session";
        public string SessionToken { get; private set; }
        private void Awake()=> SessionToken = PlayerPrefs.GetString(TokenPrefs, "");
        public IEnumerator ExchangeGoogleToken(string idToken, Action<SessionDto> ok, Action<string> fail)
        {
            var body = JsonUtility.ToJson(new ExchangeReq{ idToken=idToken });
            yield return Post("/auth/google", body, null, t => { var s=JsonUtility.FromJson<SessionDto>(t); SessionToken=s.accessToken; PlayerPrefs.SetString(TokenPrefs,s.accessToken); ok?.Invoke(s); }, fail);
        }
        public IEnumerator PostScore(int score, Action ok, Action<string> fail)
        { yield return Post("/scores", JsonUtility.ToJson(new ScoreReq{ score=score }), SessionToken, _=>ok?.Invoke(), fail); }
        public IEnumerator GetTop10(Action<string> okJson, Action<string> fail)
        { using var req=UnityWebRequest.Get(BaseUrl+"/leaderboard/top10"); req.timeout=15;
          if(!string.IsNullOrEmpty(SessionToken)) req.SetRequestHeader("Authorization","Bearer "+SessionToken);
          yield return req.SendWebRequest();
          if(req.result==UnityWebRequest.Result.Success) okJson?.Invoke(req.downloadHandler.text); else fail?.Invoke(req.error); }
        public void ClearSession(){ SessionToken=""; PlayerPrefs.DeleteKey(TokenPrefs); }
        private IEnumerator Post(string path,string json,string bearer,Action<string> ok,Action<string> fail)
        { using var req=new UnityWebRequest(BaseUrl+path,"POST"); req.uploadHandler=new UploadHandlerRaw(System.Text.Encoding.UTF8.GetBytes(json));
          req.downloadHandler=new DownloadHandlerBuffer(); req.SetRequestHeader("Content-Type","application/json"); req.timeout=15;
          if(!string.IsNullOrEmpty(bearer)) req.SetRequestHeader("Authorization","Bearer "+bearer);
          yield return req.SendWebRequest();
          if(req.result==UnityWebRequest.Result.Success) ok?.Invoke(req.downloadHandler.text); else fail?.Invoke($"{req.responseCode}: {req.error}"); }
        [Serializable] private sealed class ExchangeReq{ public string idToken; }
        [Serializable] private sealed class ScoreReq{ public int score; }
    }
}
