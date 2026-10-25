using TMPro; using UnityEngine; using Velox.Core;
namespace Velox.UI
{
    public sealed class HudController : MonoBehaviour
    {
        [SerializeField] private TMP_Text scoreText, coinsText, speedText; [SerializeField] private GameObject gameOverPanel, pausePanel;
        private void Update(){ var g=GameManager.Instance; if(!g) return;
            if(scoreText) scoreText.text=g.Score.ToString("N0"); if(coinsText) coinsText.text=g.Coins.ToString(); if(speedText) speedText.text=$"{g.Speed*3.6f:F0} km/h"; }
        private void OnEnable(){ if(GameManager.Instance) GameManager.Instance.StateChanged+=OnState; }
        private void OnDisable(){ if(GameManager.Instance) GameManager.Instance.StateChanged-=OnState; }
        private void OnState(GameState s){ gameOverPanel.SetActive(s==GameState.GameOver); pausePanel.SetActive(s==GameState.Paused); }
    }
}
