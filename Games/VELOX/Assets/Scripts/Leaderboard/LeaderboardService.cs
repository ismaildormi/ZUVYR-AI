using System; using System.Collections; using UnityEngine; using Velox.Auth; using Velox.Core;
namespace Velox.Leaderboard
{
    /// <summary>Monthly Top-10 client. On month rollover (server period != stored period) the local cache is
    /// dropped and refetched — the reset itself happens server-side, lazily on first request of the new month
    /// and via the scheduled job in Backend/, which also snapshots the previous month's Top 3 winners.</summary>
    public sealed class LeaderboardService : MonoBehaviour
    {
        [SerializeField] private VeloxBackendClient backend; [SerializeField] private AuthService auth;
        public LeaderboardResponseDto Current { get; private set; }
        public event Action<LeaderboardResponseDto> Updated; public event Action<string> Failed;
        private void OnEnable(){ if(GameManager.Instance) GameManager.Instance.ScoreSubmitted += OnScore; }
        private void OnDisable(){ if(GameManager.Instance) GameManager.Instance.ScoreSubmitted -= OnScore; }
        private void OnScore(int score){ if(auth && auth.SignedIn) StartCoroutine(SubmitThenRefresh(score)); }
        private IEnumerator SubmitThenRefresh(int s){ string err=null; yield return backend.PostScore(s, ()=>{}, e=>err=e); if(err!=null){ Failed?.Invoke(err); yield break; } yield return Refresh(); }
        public IEnumerator Refresh()
        {
            string err=null; LeaderboardResponseDto dto=null;
            yield return backend.GetTop10(json => dto = JsonUtility.FromJson<LeaderboardResponseDto>(json), e => err=e);
            if(err!=null){ Failed?.Invoke(err); yield break; }
            if(dto==null || dto.entries==null){ Failed?.Invoke("bad_leaderboard_payload"); yield break; }
            if(dto.entries.Length>10) Array.Resize(ref dto.entries, 10); // never render more than Top 10
            string stored = PlayerPrefs.GetString(GameConstants.PeriodKey, "");
            if(MonthlyPeriod.IsNewPeriod(stored, DateTime.UtcNow) || stored != dto.periodId)
                PlayerPrefs.SetString(GameConstants.PeriodKey, dto.periodId); // new month Contest started: stale local best-for-month is dropped
            Current = dto; Updated?.Invoke(dto);
        }
    }
}
