#if UFC_FIREBASE && UFC_GOOGLE_SIGNIN
using System;
using System.Threading.Tasks;
using UnityEngine;
using UltimateFootballChase.Backend;

// Intentionally outside the game's asmdef: Google's legacy Unity plugin ships in Assembly-CSharp.
// UFC_GOOGLE_SIGNIN must only be set after importing the plugin AND configuring the Web client ID.
internal sealed class GoogleTokenPluginBridge : IGoogleTokenProvider
{
    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
    private static void Register() { GoogleTokenBridge.Provider = new GoogleTokenPluginBridge(); }

    public async Task<string> GetIdTokenAsync()
    {
        TextAsset config = Resources.Load<TextAsset>("GoogleWebClientId");
        if (config == null || string.IsNullOrWhiteSpace(config.text))
            throw new InvalidOperationException("Missing Resources/GoogleWebClientId.txt (OAuth WEB client ID)");
        Google.GoogleSignIn.Configuration = new Google.GoogleSignInConfiguration
        {
            WebClientId = config.text.Trim(), RequestIdToken = true, RequestEmail = true
        };
        var user = await Google.GoogleSignIn.DefaultInstance.SignIn();
        return user.IdToken;
    }
}
#endif
