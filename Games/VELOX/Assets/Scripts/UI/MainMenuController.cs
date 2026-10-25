using TMPro; using UnityEngine; using UnityEngine.UI; using Velox.Auth; using Velox.Core;
namespace Velox.UI
{
    /// <summary>VELOX main menu: logo/buttons are Inspector-wired TMP assets you own — no copied game UI.
    /// Gmail sign-in is optional-to-play, required only for the monthly leaderboard.</summary>
    public sealed class MainMenuController : MonoBehaviour
    {
        [SerializeField] private TMP_Text logoText; // set to "VELOX" in the scene (Editor setup does this)
        [SerializeField] private Button playButton, signInButton, leaderboardButton, signOutButton;
        [SerializeField] private TMP_Text playerLabel, authStatus; [SerializeField] private GameObject leaderboardPanel;
        [SerializeField] private AuthService auth;
        private void Awake(){ if(logoText) logoText.text=GameConstants.GameName;
            playButton.onClick.AddListener(()=>GameManager.Instance.StartRun());
            signInButton.onClick.AddListener(()=>auth.SignInWithGoogle(e=>{ if(authStatus) authStatus.text="Sign-in failed. You can still play offline."; }));
            signOutButton.onClick.AddListener(()=>auth.SignOut());
            leaderboardButton.onClick.AddListener(()=>leaderboardPanel.SetActive(true));
            if(auth) auth.SignedInChanged+=OnAuth; OnAuth(auth?auth.CurrentUser:null); }
        private void OnAuth(VeloxUser u){ bool inn=u!=null; signInButton.gameObject.SetActive(!inn); signOutButton.gameObject.SetActive(inn);
            playerLabel.text = inn ? $"{GameConstants.HeroName}: {u.displayName}" : $"{GameConstants.HeroName} Runner"; authStatus.text = inn?"Signed in with Google":"Playing as guest — sign in for the monthly Top 10"; }
    }
}
