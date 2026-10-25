using TMPro; using UnityEngine; using UnityEngine.UI; using Velox.Leaderboard;
namespace Velox.UI
{
    public sealed class LeaderboardEntryView : MonoBehaviour
    {
        [SerializeField] private TMP_Text rankText, nameText, scoreText; [SerializeField] private Image background, medalIcon;
        [SerializeField] private Color first=new Color(1f,.84f,0f), second=new Color(.75f,.75f,.8f), third=new Color(.8f,.5f,.25f), mine=new Color(.1f,.5f,.9f,.35f), normal=Color.clear; // 🎨 idea: gold/silver/bronze tint for monthly Top-3
        public void Bind(LeaderboardEntryDto e)
        { if(!e){ gameObject.SetActive(false); return; } gameObject.SetActive(true);
          rankText.text = $"#{e.rank}"; nameText.text = string.IsNullOrWhiteSpace(e.displayName)?"NEO Runner":e.displayName; scoreText.text = e.score.ToString("N0");
          background.color = e.isCurrentUser ? mine : e.rank==1?first : e.rank==2?second : e.rank==3?third : normal; }
    }
}
