using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using VELOX.Backend;
using VELOX.Core;

namespace VELOX.UI
{
    /// <summary>One row in the Top-10 leaderboard list.</summary>
    [Serializable]
    public class LeaderboardRow : MonoBehaviour
    {
        public TMP_Text rankText;
        public TMP_Text nameText;
        public TMP_Text scoreText;
        public Image highlight;

        public void Set(int rank, LeaderboardEntry entry)
        {
            if (rankText != null) rankText.text = rank.ToString("D2");
            if (nameText != null) nameText.text = entry.name;
            if (scoreText != null) scoreText.text = entry.score.ToString("D6");
            if (highlight != null) highlight.enabled = rank <= GameIdentity.TopPodiumCount;
        }
    }

    /// <summary>
    /// UI manager for the monthly Top-10 leaderboard. Fetches and renders the
    /// best ten players, submits the local player's score on game over, and
    /// rolls the competition over at the start of each calendar month.
    /// </summary>
    public class LeaderboardManager : MonoBehaviour
    {
        [Header("Panel")]
        public GameObject leaderboardPanel;
        public TMP_Text titleText;
        public TMP_Text monthText;
        public Transform rowsContainer;
        public LeaderboardRow rowPrefab;
        public GameObject emptyRow;
        public Button closeButton;
        public Button refreshButton;

        [Header("Backend")]
        public bool useFirebase = false;
        public FirebaseConfig firebaseConfig;
        public ILeaderboardService Service;

        [Header("Competition")]
        public int topCount = GameIdentity.LeaderboardSize;
        public int podiumCount = GameIdentity.TopPodiumCount;

        private readonly List<LeaderboardRow> _rows = new List<LeaderboardRow>();
        private bool _loading;
        private bool _subscribed;
        private string _lastMonthKey;

        public bool IsVisible => leaderboardPanel != null && leaderboardPanel.activeSelf;
        public IReadOnlyList<LeaderboardEntry> Entries { get; private set; }

        public void Bind(GameDirector director)
        {
            ResolveService();

            if (titleText != null) titleText.text = GameIdentity.GameName + " — Top " + topCount;
            if (closeButton != null) closeButton.onClick.AddListener(Hide);
            if (refreshButton != null) refreshButton.onClick.AddListener(() => { _ = RefreshAsync(); });

            EnsureMonthlyReset();
        }

        public void ResolveService()
        {
            if (Service != null) return;

            if (useFirebase && firebaseConfig != null && firebaseConfig.enabled &&
                firebaseConfig.IsValid(out _))
            {
                Service = new FirebaseLeaderboardService(firebaseConfig);
            }
            else
            {
                Service = new LocalLeaderboardService();
            }
        }

        public async Task RefreshAsync()
        {
            if (_loading || Service == null) return;

            _loading = true;
            try
            {
                Entries = await Service.GetTopAsync(topCount);
                PopulateRows();
            }
            finally
            {
                _loading = false;
            }
        }

        private void PopulateRows()
        {
            foreach (LeaderboardRow row in _rows)
                if (row != null) Destroy(row.gameObject);
            _rows.Clear();

            if (rowsContainer == null) return;

            if (Entries == null || Entries.Count == 0)
            {
                if (emptyRow != null) Instantiate(emptyRow, rowsContainer);
                return;
            }

            for (int i = 0; i < Entries.Count; i++)
            {
                if (rowPrefab == null) break;

                LeaderboardRow row = Instantiate(rowPrefab, rowsContainer).GetComponent<LeaderboardRow>();
                row.Set(i + 1, Entries[i]);
                _rows.Add(row);
            }
        }

        public void Show()
        {
            if (leaderboardPanel != null) leaderboardPanel.SetActive(true);
            _ = RefreshAsync();
        }

        public void Hide()
        {
            if (leaderboardPanel != null) leaderboardPanel.SetActive(false);
        }

        public void Toggle()
        {
            if (IsVisible) Hide();
            else Show();
        }

        /// <summary>Rolls the monthly competition over if the calendar month changed.</summary>
        public void EnsureMonthlyReset() => EnsureMonthlyReset(false);

        public void EnsureMonthlyReset(bool force)
        {
            ResolveService();
            if (Service == null) return;

            EnsureSubscribed();

            string month = Service.CurrentMonthKey;
            if (force || _lastMonthKey != month)
            {
                _lastMonthKey = month;
                _ = Service.ResetCurrentMonthAsync().ContinueWith(_ =>
                {
                    if (monthText != null) monthText.text = "Monthly Standings — " + month;
                    Service.RaiseChanged();
                });

                if (monthText != null) monthText.text = "Monthly Standings — " + month;
                Service.RaiseChanged();
            }
        }

        private void EnsureSubscribed()
        {
            if (_subscribed || Service == null) return;
            Service.OnChanged += OnServiceChanged;
            _subscribed = true;
        }

        private void OnServiceChanged()
        {
            if (IsVisible) _ = RefreshAsync();
        }

        /// <summary>Submits a score for the named player (fire-and-forget).</summary>
        public async void SubmitScore(int score, string name, Action<bool> done = null)
        {
            if (Service == null)
            {
                done?.Invoke(false);
                return;
            }

            try
            {
                bool ok = await Service.SubmitScoreAsync(name, score);
                done?.Invoke(ok);
            }
            catch (Exception e)
            {
                Debug.LogWarning("[VELOX] Failed to submit score: " + e.Message);
                done?.Invoke(false);
            }
        }

        void OnDestroy()
        {
            if (_subscribed && Service != null) Service.OnChanged -= OnServiceChanged;
        }
    }
}
