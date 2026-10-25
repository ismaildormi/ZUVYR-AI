using System;
using UnityEngine;
namespace Velox.Core
{
    public enum GameState { Boot, Menu, Playing, Paused, GameOver }
    public sealed class GameManager : MonoBehaviour
    {
        public static GameManager Instance { get; private set; }
        public GameState State { get; private set; } = GameState.Boot;
        public float Distance { get; private set; }
        public int Coins { get; private set; }
        public int Score => Mathf.FloorToInt(Distance) + Coins * 10;
        [SerializeField] private float baseSpeed = 9f, maxSpeed = 26f, acceleration = 0.08f;
        public float Speed { get; private set; }
        public event Action<GameState> StateChanged;
        public event Action<int> ScoreSubmitted;
        private void Awake(){ if(Instance && Instance!=this){Destroy(gameObject);return;} Instance=this; DontDestroyOnLoad(gameObject); Speed=baseSpeed; SetState(GameState.Menu); }
        public void StartRun(){ Distance=0; Coins=0; Speed=baseSpeed; SetState(GameState.Playing); }
        public void Pause(bool p)=> SetState(p?GameState.Paused:GameState.Playing);
        public void GameOver(){ SetState(GameState.GameOver); int best=PlayerPrefs.GetInt(GameConstants.ScoreKey,0); if(Score>best) PlayerPrefs.SetInt(GameConstants.ScoreKey,Score); ScoreSubmitted?.Invoke(Score); }
        public void AddCoins(int n)=> Coins+=Mathf.Max(0,n);
        private void Update(){ if(State!=GameState.Playing) return; Speed=Mathf.Min(maxSpeed,Speed+acceleration*Time.deltaTime); Distance+=Speed*Time.deltaTime; }
        private void SetState(GameState s){ State=s; Time.timeScale = s==GameState.Paused?0f:1f; StateChanged?.Invoke(s); }
    }
}
