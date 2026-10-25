using System; using TMPro; using UnityEngine; using Velox.Leaderboard;
namespace Velox.UI
{
    /// <summary>Monthly Top-10 panel: exactly 10 rows, live countdown to the automatic month-end reset,
    /// and an empty state when signed out so no fake/placeholder players are ever shown.</summary>
    public sealed class LeaderboardPanel : MonoBehaviour
    {
        [SerializeField] private LeaderboardService service; [SerializeField] private LeaderboardEntryView[] rows; // wire exactly 10
        [SerializeField] private TMP_Text titleText, countdownText, statusText; [SerializeField] private GameObject signedOutState;
        private void OnEnable(){ if(service){ service.Updated+=Render; service.Failed+=OnFailed; StartCoroutine(service.Refresh()); } }
        private void OnDisable(){ if(service){ service.Updated-=Render; service.Failed-=OnFailed; } }
        private void Update(){ var left=MonthlyPeriod.TimeToReset(DateTime.UtcNow); if(countdownText) countdownText.text=$"New Contest starts in {left.Days}d {left.Hours:00}:{left.Minutes:00}:{left.Seconds:00}"; }
        private void Render(LeaderboardResponseDto dto)
        { if(titleText) titleText.text=$"VELOX — Top 10 · {dto.periodId}";
          if(signedOutState) signedOutState.SetActive(dto.entries.Length==0);
          for(int i=0;i<rows.Length;i++) rows[i].Bind(dto.entries!=null && i<dto.entries.Length ? dto.entries[i] : null);
          if(statusText) statusText.text = dto.myEntry!=null ? $"You: #{dto.myEntry.rank} · {dto.myEntry.score:N0}" : "Play a run to enter this month's Top 10"; }
        private void OnFailed(string e){ if(statusText) statusText.text="Leaderboard unavailable — check connection."; }
    }
}
