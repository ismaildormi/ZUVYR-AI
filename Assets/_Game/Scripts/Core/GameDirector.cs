using System;
using System.Collections;
using UnityEngine;
using VELOX.Backend;
using VELOX.Gameplay;
using VELOX.UI;
using VELOX.Visuals;

namespace VELOX.Core
{
    /// <summary>High level lifecycle of the game.</summary>
    public enum GamePhase
    {
        Menu = 0,
        Countdown = 1,
        Playing = 2,
        Paused = 3,
        GameOver = 4
    }

    /// <summary>
    /// Central orchestrator. Owns the run state machine, accumulates score,
    /// drives the <see cref="RunnerMotor"/>/<see cref="TrackWorld"/> and wires
    /// the backend (<see cref="AccountSession"/> +
    /// <see cref="LeaderboardManager"/>) into the gameplay loop.
    /// </summary>
    public class GameDirector : MonoBehaviour
    {
        public static GameDirector Instance { get; private set; }

        [Header("Branding")]
        [Tooltip("Overrides GameIdentity values per scene if needed.")]
        public string displayGameName = GameIdentity.GameName;
        public string displayCharacterName = GameIdentity.PlayerName;

        [Header("Systems")]
        public RunnerMotor runner;
        public TrackWorld trackWorld;
        public GameUI gameUI;
        public LeaderboardManager leaderboardManager;
        public AccountSession accountSession;
        public VisualCatalog visualCatalog;
        public GameEvents events;

        [Header("Run configuration")]
        [Range(10, 60)] public float startSpeed = 12f;
        [Range(10, 120)] public float maxSpeed = 34f;
        [Tooltip("Speed ramp coefficient: fraction of (max-start) reached per meter.")]
        public float speedRampPerMeter = 0.0012f;
        [Range(1, 10)] public float countdownSeconds = 3f;
        public bool autoSubmitScoreOnGameOver = true;

        [Header("Run state")]
        public GamePhase phase = GamePhase.Menu;
        public int score { get; private set; }
        public int bestScore { get; private set; }
        public float distance { get; private set; }
        public int coins { get; private set; }

        /// <summary>Raised whenever the score changes during a run.</summary>
        public static event Action<int> OnScoreChanged;

        /// <summary>Raised whenever the phase changes.</summary>
        public static event Action<GamePhase> OnPhaseChanged;

        private Coroutine _countdown;
        private readonly string _bestKey = "VELOX.BestScore";

        /// <summary>Current scroll speed, ramped with distance.</summary>
        public float CurrentSpeed =>
            Mathf.Lerp(startSpeed, maxSpeed,
                Mathf.Clamp01(distance * speedRampPerMeter));

        public bool IsPlaying => phase == GamePhase.Playing;

        /// <summary>Name used when submitting to the leaderboard.</summary>
        public string LeaderboardDisplayName =>
            accountSession != null && accountSession.HasProfile
                ? accountSession.CurrentUser.DisplayName
                : displayCharacterName;

        void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Debug.LogWarning("[VELOX] GameDirector already exists; destroying duplicate.");
                Destroy(gameObject);
                return;
            }

            Instance = this;
            DontDestroyOnLoad(gameObject);
        }

        void Start()
        {
            ResolveReferences();
            ServiceLocator.Register(this, accountSession, leaderboardManager, gameUI, events);

            bestScore = PlayerPrefs.GetInt(_bestKey, 0);

            if (accountSession != null)
                accountSession.OnProfileChanged += HandleProfileChanged;

            // Roll the monthly competition over on boot.
            if (leaderboardManager != null)
                leaderboardManager.EnsureMonthlyReset();

            gameUI?.Bind(this);
            leaderboardManager?.Bind(this);

            SetPhase(GamePhase.Menu);
            events?.onGameBoot?.Invoke();
        }

        void Update()
        {
            if (Input.GetKeyDown(KeyCode.Escape) || Input.GetKeyDown(KeyCode.P))
            {
                if (phase == GamePhase.Playing) Pause();
                else if (phase == GamePhase.Paused) Resume();
            }

            if (phase == GamePhase.Playing)
            {
                distance += CurrentSpeed * Time.deltaTime;
                score = (int)(distance * 10f) + coins * 100;

                if (runner != null) runner.SetSpeed(CurrentSpeed);
                if (trackWorld != null) trackWorld.SetSpeed(CurrentSpeed);

                OnScoreChanged?.Invoke(score);
                events?.onScoreChanged?.Invoke(score);
            }
            else if (phase == GamePhase.Menu && trackWorld != null)
            {
                // Gentle scrolling behind the menu for a sense of motion.
                trackWorld.IdleScroll(CurrentSpeed * 0.35f);
            }
        }

        private void ResolveReferences()
        {
            runner       ??= FindObjectOfType<RunnerMotor>();
            trackWorld   ??= FindObjectOfType<TrackWorld>();
            gameUI       ??= FindObjectOfType<GameUI>();
            leaderboardManager ??= FindObjectOfType<LeaderboardManager>();
            accountSession    ??= AccountSession.Instance;
            events           ??= ScriptableObject.CreateInstance<GameEvents>();
        }

        private void SetPhase(GamePhase p)
        {
            if (phase == p) return;
            phase = p;
            OnPhaseChanged?.Invoke(p);
        }

        public void StartRun()
        {
            score = 0;
            distance = 0;
            coins = 0;

            events?.onRunStarted?.Invoke();

            runner?.Reset();
            runner?.SetStopped(true);   // freeze input during the countdown
            trackWorld?.Reset();
            trackWorld?.StartRunning();

            SetPhase(GamePhase.Countdown);
            _countdown = StartCoroutine(CountdownCoroutine());
        }

        private IEnumerator CountdownCoroutine()
        {
            float t = countdownSeconds;
            while (t > 0f)
            {
                t -= Time.deltaTime;
                yield return null;
            }
            runner?.SetStopped(false);
            SetPhase(GamePhase.Playing);
        }

        /// <summary>Called by the <see cref="RunnerMotor"/> when a run ends.</summary>
        public void OnPlayerDied()
        {
            if (phase != GamePhase.Playing) return;

            StopCountdown();
            runner?.Stop();
            trackWorld?.Stop();

            SetPhase(GamePhase.GameOver);
            events?.onPlayerDied?.Invoke();

            if (score > bestScore)
            {
                bestScore = score;
                PlayerPrefs.SetInt(_bestKey, bestScore);
                PlayerPrefs.Save();
                events?.onBestScoreChanged?.Invoke(bestScore);
            }

            events?.onRunEnded?.Invoke();

            if (autoSubmitScoreOnGameOver && leaderboardManager != null)
                leaderboardManager.SubmitScore(score, LeaderboardDisplayName);
        }

        public void Restart()
        {
            gameUI?.HideGameOver();
            StartRun();
        }

        public void QuitToMenu()
        {
            StopCountdown();
            runner?.Reset();
            trackWorld?.Reset();
            gameUI?.HideGameOver();
            SetPhase(GamePhase.Menu);
        }

        public void Pause()
        {
            if (phase != GamePhase.Playing) return;
            runner?.SetStopped(true);
            trackWorld?.SetSpeed(0f);
            SetPhase(GamePhase.Paused);
        }

        public void Resume()
        {
            if (phase != GamePhase.Paused) return;
            runner?.SetStopped(false);
            SetPhase(GamePhase.Playing);
        }

        private void StopCountdown()
        {
            if (_countdown != null)
            {
                StopCoroutine(_countdown);
                _countdown = null;
            }
        }

        public void RaiseScore(int value) => OnScoreChanged?.Invoke(value);

        /// <summary>Adds coins collected during a run.</summary>
        public void AddCoins(int amount)
        {
            if (amount <= 0) return;
            coins += amount;
        }

        private void HandleProfileChanged(PlayerProfile p)
        {
            events?.onProfileChanged?.Invoke(p != null ? p.DisplayName : string.Empty);
            events?.onLoginChanged?.Invoke();
        }

        void OnDestroy()
        {
            if (Instance == this) Instance = null;
            if (accountSession != null)
                accountSession.OnProfileChanged -= HandleProfileChanged;
        }
    }
}
