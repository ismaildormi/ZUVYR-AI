using System;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using VELOX.Backend;
using VELOX.Core;

namespace VELOX.UI
{
    /// <summary>
    /// Drives all top-level UI: title/menu, HUD, pause, game-over and the
    /// leaderboard entry point. Subscribes to the <see cref="GameDirector"/>
    /// static events and owns the Google login flow via <see cref="AccountSession"/>.
    /// </summary>
    public class GameUI : MonoBehaviour
    {
        [Header("Branding")]
        public TMP_Text gameNameText;
        public TMP_Text characterNameText;

        [Header("HUD")]
        public GameObject hudPanel;
        public TMP_Text scoreText;
        public TMP_Text bestText;
        public TMP_Text coinsText;
        public TMP_Text speedText;
        public Button pauseButton;

        [Header("Menu")]
        public GameObject menuPanel;
        public Button startButton;
        public Button loginButton;
        public Button leaderboardButton;
        public Button quitButton;
        public TMP_Text loginStatusText;
        public TMP_Text bestMenuText;

        [Header("Game Over")]
        public GameObject gameOverPanel;
        public TMP_Text gameOverScoreText;
        public TMP_Text gameOverBestText;
        public TMP_Text gameOverRankText;
        public Button restartButton;
        public Button gameOverQuitButton;
        public Button gameOverLeaderboardButton;

        [Header("Pause")]
        public GameObject pausePanel;
        public Button resumeButton;
        public Button pauseQuitButton;

        private GameDirector _director;

        public void Bind(GameDirector director)
        {
            _director = director;

            ApplyBranding();
            GameDirector.OnScoreChanged += OnScoreChanged;
            GameDirector.OnPhaseChanged += OnPhaseChanged;

            startButton?.onClick.AddListener(() => director.StartRun());
            loginButton?.onClick.AddListener(OnLoginClicked);
            leaderboardButton?.onClick.AddListener(ShowLeaderboard);
            quitButton?.onClick.AddListener(() => director.QuitToMenu());

            pauseButton?.onClick.AddListener(() => director.Pause());

            restartButton?.onClick.AddListener(() => director.Restart());
            gameOverQuitButton?.onClick.AddListener(() => director.QuitToMenu());
            gameOverLeaderboardButton?.onClick.AddListener(ShowLeaderboard);

            resumeButton?.onClick.AddListener(() => director.Resume());
            pauseQuitButton?.onClick.AddListener(() => director.QuitToMenu());

            ShowLoginStatus(ServiceLocator.AccountSession != null && ServiceLocator.AccountSession.HasProfile
                ? ServiceLocator.AccountSession.CurrentUser.DisplayName
                : "Sign in with Google");
        }

        private void ApplyBranding()
        {
            if (gameNameText != null) gameNameText.text = GameIdentity.GameName;
            if (characterNameText != null) characterNameText.text = GameIdentity.PlayerName;
        }

        private void OnScoreChanged(int score)
        {
            if (scoreText != null) scoreText.text = score.ToString();
            if (_director != null && bestText != null) bestText.text = "BEST  " + _director.bestScore;
            if (coinsText != null && _director != null) coinsText.text = _director.coins.ToString();
            if (speedText != null && _director != null)
                speedText.text = _director.CurrentSpeed.ToString("F1");
        }

        private void OnPhaseChanged(GamePhase phase)
        {
            if (menuPanel != null) menuPanel.SetActive(phase == GamePhase.Menu);
            if (gameOverPanel != null) gameOverPanel.SetActive(phase == GamePhase.GameOver);
            if (pausePanel != null) pausePanel.SetActive(phase == GamePhase.Paused);
            if (hudPanel != null) hudPanel.SetActive(phase == GamePhase.Playing || phase == GamePhase.Paused);

            if (phase == GamePhase.Menu && _director != null && bestMenuText != null)
                bestMenuText.text = "BEST  " + _director.bestScore;

            if (phase == GamePhase.GameOver && _director != null)
            {
                if (gameOverScoreText != null) gameOverScoreText.text = "SCORE  " + _director.score;
                if (gameOverBestText != null) gameOverBestText.text = "BEST  " + _director.bestScore;
                ShowLeaderboardRank(_director.score);
            }
        }

        private void ShowLeaderboardRank(int score)
        {
            if (gameOverRankText == null || ServiceLocator.LeaderboardManager == null) return;

            var top = ServiceLocator.LeaderboardManager.Entries;
            if (top == null) return;

            int rank = -1;
            for (int i = 0; i < top.Count; i++)
            {
                if (top[i].score >= score)
                {
                    rank = i + 1;
                    break;
                }
            }

            gameOverRankText.text = rank > 0 ? "RANK  #" + rank : "RANK  —";
        }

        public void ShowGameOver(int score, int best)
        {
            if (gameOverPanel != null) gameOverPanel.SetActive(true);
            if (gameOverScoreText != null) gameOverScoreText.text = "SCORE  " + score;
            if (gameOverBestText != null) gameOverBestText.text = "BEST  " + best;
        }

        public void HideGameOver()
        {
            if (gameOverPanel != null) gameOverPanel.SetActive(false);
        }

        public void ShowLoginStatus(string status)
        {
            if (loginStatusText != null) loginStatusText.text = status;
        }

        private async void OnLoginClicked()
        {
            var session = ServiceLocator.AccountSession;
            if (session == null) return;

            ShowLoginStatus("Connecting to Google…");

            bool ok = await session.LoginWithGoogleAsync();
            if (!ok)
                ok = await session.LoginAnonymousAsync();

            if (ok && session.HasProfile)
                ShowLoginStatus(session.CurrentUser.DisplayName);
            else
                ShowLoginStatus("Sign-in unavailable");
        }

        public void ShowLeaderboard() => ServiceLocator.LeaderboardManager?.Show();

        public void HideLeaderboard() => ServiceLocator.LeaderboardManager?.Hide();

        void OnDestroy()
        {
            GameDirector.OnScoreChanged -= OnScoreChanged;
            GameDirector.OnPhaseChanged -= OnPhaseChanged;
        }
    }
}
