using UnityEngine;
using UltimateFootballChase.Gameplay;
using UltimateFootballChase.Input;
using UltimateFootballChase.UI;
using UltimateFootballChase.CameraSystem;
using UltimateFootballChase.Characters;
using UltimateFootballChase.Difficulty;
using UltimateFootballChase.PowerUps;
using UltimateFootballChase.Hub;
using UltimateFootballChase.Backend;
using UltimateFootballChase.Economy;
using UltimateFootballChase.Ads;
using UltimateFootballChase.Settings;
using UltimateFootballChase.Missions;
using UltimateFootballChase.Seasons;
using System;
using UnityEngine.SceneManagement;

namespace UltimateFootballChase.Core
{
    public enum RunState { Running, Paused, Replay, Decision, Ended }

    /// <summary>Runner with preview-only Hub progress; never a trusted leaderboard/prize result.</summary>
    public sealed class GameDirector : MonoBehaviour
    {
        [SerializeField] private RunConfig config;
        [SerializeField] private DifficultyProfile difficulty;
        [SerializeField] private PowerUpConfig powerConfig;
        private PowerUpState powers;
        private TrackWorld track;
        private RunnerMotor runner;
        private GameObject[] effectVisuals;
        private ChaseCamera chaseCamera;
        private GameHUD hud;
        private SwipeInput input;
        private ReplayRecorder replay;
        private RunSession session;
        private Transform chaser;
        private Renderer chaserCard;
        private float chaserProximity;
        private RunState state;
        private bool transitioning;
        private int countedJumps;
        public bool IsRunning => state == RunState.Running;

        private void Awake()
        {
            if (config == null) config = Resources.Load<RunConfig>("RunConfig");
            if (config == null)
            {
                Debug.LogWarning("RunConfig asset missing. Using temporary default configuration; run Tools > Ultimate Football Chase > Build Phases 1–4 Scenes.");
                config = ScriptableObject.CreateInstance<RunConfig>();
            }
            if (difficulty == null) difficulty = Resources.Load<DifficultyProfile>("DifficultyProfile");
            if (difficulty == null)
            {
                Debug.LogWarning("DifficultyProfile missing; using provisional runtime defaults. Regenerate the scene to save the asset.");
                difficulty = ScriptableObject.CreateInstance<DifficultyProfile>();
            }
            if (powerConfig == null) powerConfig = Resources.Load<PowerUpConfig>("PowerUpConfig");
            if (powerConfig == null)
            {
                Debug.LogWarning("PowerUpConfig missing; use the scene builder to create it. Temporary defaults are test-only.");
                powerConfig = ScriptableObject.CreateInstance<PowerUpConfig>();
            }
            AccountSession.Ensure(); // direct runner scene opens must also restore the authenticated repository
            AdSession.Ensure();
            GameAudio.Ensure().Apply(HubGuestProgress.Load().Options);
            powers = new PowerUpState(powerConfig);
            Application.targetFrameRate = 60; // provisional performance target, subject to device QA
            Screen.orientation = ScreenOrientation.Portrait;
            BuildGreybox();
            AccountSession.Instance.ProfileChanged += OnAccountProfileChanged;
            session = new RunSession(config.TestOnlyStartingKeys,
                HubGuestProgress.Load().PreviewMissionChain);
            replay = new ReplayRecorder(config, runner, track, chaser);
            replay.Capture(.05f);
            hud.ShowRunning();
            state = RunState.Running;
        }
        private void BuildGreybox()
        {
            track = new GameObject("Endless track - pooled segments").AddComponent<TrackWorld>();
            HubConfig hubConfig = Resources.Load<HubConfig>("HubConfig");
            int cycle = hubConfig != null ? hubConfig.SeasonCycleMonths : 3;
            track.Initialize(config, difficulty, powerConfig, 42, RunnerSeasons.At(DateTime.UtcNow, cycle));
            runner = GreyboxActors.CreatePlayer(config);
            // Hub outfit is a guest/account preview; no paid entitlement is inferred.
            OnAccountProfileChanged(HubGuestProgress.Load());
            effectVisuals = new GameObject[4];
            effectVisuals[0] = runner.transform.Find("Magnet effect").gameObject;
            effectVisuals[1] = runner.transform.Find("Super shoes effect").gameObject;
            effectVisuals[2] = runner.transform.Find("Jetpack flame").gameObject;
            effectVisuals[3] = runner.transform.Find("Hoverboard effect").gameObject;
            effectVisuals[3].GetComponent<Renderer>().material.color = StoreCatalog.BoardColor(
                AccountSession.Instance != null && !AccountSession.Instance.IsSignedIn ?
                    new LocalPracticeStore().Load().SelectedBoardId : "");
            chaser = GreyboxActors.CreateChaser(out chaserCard);
            GameObject cameraGo = new GameObject("Portrait fixed-behind camera", typeof(UnityEngine.Camera), typeof(AudioListener), typeof(ChaseCamera));
            cameraGo.tag = "MainCamera";
            UnityEngine.Camera cam = cameraGo.GetComponent<UnityEngine.Camera>();
            cam.fieldOfView = 55;
            cam.nearClipPlane = .08f;
            cam.farClipPlane = 170;
            cam.backgroundColor = new Color(.04f, .10f, .16f);
            chaseCamera = cameraGo.GetComponent<ChaseCamera>();
            chaseCamera.Initialize(runner.transform);
            var lighting = new GameObject("Sun", typeof(Light)).GetComponent<Light>();
            lighting.type = LightType.Directional;
            lighting.intensity = 1.25f;
            lighting.transform.rotation = Quaternion.Euler(50, -30, 0);
            input = gameObject.AddComponent<SwipeInput>();
            input.Initialize(this, powerConfig.DoubleTapWindowSeconds);
            input.OnAction += action =>
            {
                runner.Queue(action);
                if (action == RunAction.Jump && !runner.IsSliding) GameAudio.Instance.Jump();
            };
            input.OnDoubleTap += () => powers.TryActivateBoard();
            hud = gameObject.AddComponent<GameHUD>();
            hud.Initialize(this);
            HubProgress initialHudProfile = HubGuestProgress.Load();
            hud.SetLocalBest(initialHudProfile.BestPreviewScore);
            hud.SetLanguage(initialHudProfile.Options.Language);
        }
        private void OnAccountProfileChanged(HubProgress profile)
        {
            if (profile == null || runner == null) return;
            GameAudio.Ensure().Apply(profile.Options);
            if (session != null) session.RestoreMissionsBeforeRun(profile.PreviewMissionChain);
            if (hud != null)
            {
                hud.SetLocalBest(profile.BestPreviewScore);
                hud.SetLanguage(profile.Options.Language);
            }
            string tint = profile.SelectedOutfit;
            if (AccountSession.Instance != null && !AccountSession.Instance.IsSignedIn)
            {
                string demoTint = new LocalPracticeStore().Load().SelectedTintId;
                if (StoreCatalog.IsDemoTint(demoTint)) tint = demoTint;
            }
            if (effectVisuals != null) effectVisuals[3].GetComponent<Renderer>().material.color = StoreCatalog.BoardColor(
                AccountSession.Instance != null && !AccountSession.Instance.IsSignedIn ?
                    new LocalPracticeStore().Load().SelectedBoardId : "");
            OriginalRoster.Show(runner.Visual, profile.SelectedCharacter);
            Color outfit = StoreCatalog.IsDemoTint(tint) ? HubWorldBuilder.OutfitColor(tint) :
                OriginalRoster.KitColor(profile.SelectedCharacter, tint);
            runner.Visual.GetComponent<Renderer>().material.color = outfit;
            foreach (Renderer part in runner.Visual.GetComponentsInChildren<Renderer>())
                if (part.gameObject.name == "Comic runner arm") part.material.color = outfit;
        }
        private void OnDestroy()
        {
            if (AccountSession.Instance != null)
                AccountSession.Instance.ProfileChanged -= OnAccountProfileChanged;
        }
        private void Update()
        {
            if (!IsRunning || AccountSession.Instance.IsBusy) return;
            if (AccountSession.Instance.IsSignedIn && !AccountSession.Instance.HasActiveAccountProfile)
            {
                state = RunState.Paused;
                hud.ShowProfileUnavailable();
                return;
            }
            float remaining = Mathf.Min(Time.deltaTime, .05f); // provisional max step on slow devices
            while (remaining > .000001f && IsRunning)
            {
                float speed = difficulty.SpeedAt(session.DistanceMeters, config.StartingSpeedMetersPerSecond);
                float step = remaining;
                if (session.DistanceMeters < DifficultyProfile.SpeedCapMetres)
                {
                    // Split frames exactly at each 100m threshold: no frame of old speed past the step.
                    float next = (Mathf.Floor(session.DistanceMeters / DifficultyProfile.SpeedStepMetres) + 1f)
                        * DifficultyProfile.SpeedStepMetres;
                    float untilStep = (next - session.DistanceMeters) / speed;
                    if (untilStep > .00001f) step = Mathf.Min(step, untilStep);
                }
                powers.Tick(step);
                for (int i = 0; i < effectVisuals.Length; i++)
                    effectVisuals[i].SetActive(powers.Active((PowerKind)i));
                runner.SetPowerEffects(powers.Active(PowerKind.SuperShoes), powerConfig.SuperShoesHeightMultiplier,
                    powers.Flying, powerConfig.JetpackFlightHeightMetres, powerConfig.JetpackLandingGraceSeconds);
                runner.Tick(step);
                while (countedJumps < runner.AcceptedJumps)
                {
                    session.Jump(); countedJumps++;
                }
                track.Tick(step, speed);
                session.Advance(speed * step);
                chaserProximity = Mathf.Max(0f, chaserProximity - step / config.ChaserNearSeconds);
                chaser.position = new Vector3(runner.X * .5f, 0, Mathf.Lerp(-6f, -1.4f, chaserProximity));
                CheckPowerPickups();
                CheckPickups();
                CheckHazards();
                if (IsRunning) replay.Capture(step);
                remaining -= step;
            }
            float displaySpeed = difficulty.SpeedAt(session.DistanceMeters, config.StartingSpeedMetersPerSecond);
            hud.UpdateRun(session, chaserProximity, displaySpeed, difficulty.TierAt(session.DistanceMeters));
            if (IsRunning) { hud.UpdatePowers(powers); hud.UpdatePreview(track); }
        }
        private void CheckPowerPickups()
        {
            foreach (PowerPickup pickup in track.PowerPickups)
            {
                if (pickup.Checked || !(pickup.PreviousZ > 0f && pickup.Object.transform.position.z <= 0f)) continue;
                pickup.Checked = true;
                if (Mathf.Abs(pickup.Object.transform.position.x - runner.X) > .95f) continue;
                powers.Collect(pickup.Kind);
                pickup.Object.SetActive(false);
            }
        }
        private void CheckPickups()
        {
            foreach (Pickup coin in track.Pickups)
            {
                if (coin.Checked) continue;
                float z = coin.Object.transform.position.z;
                bool flying = powers.Flying;
                if (flying && z > 0f && z < 18f)
                    coin.Object.transform.position = new Vector3(runner.X, powerConfig.JetpackFlightHeightMetres + 1f, z);
                else if (!flying && coin.Object.transform.position.y != 1f)
                    coin.Object.transform.position = new Vector3((coin.Lane - 1) * config.LaneWidth, 1f, z);
                bool reached = coin.PreviousZ > 0f && z <= 0f;
                bool magnetPull = powers.Active(PowerKind.Magnet) && z >= 0f &&
                    z <= powerConfig.MagnetAheadMetres &&
                    Mathf.Abs((coin.Lane - 1) * config.LaneWidth - runner.X) <= powerConfig.MagnetRangeMetres;
                if (!magnetPull && !reached) continue;
                coin.Checked = true;
                if (flying || magnetPull || Mathf.Abs((coin.Lane - 1) * config.LaneWidth - runner.X) <= .85f)
                {
                    session.CollectCoin();
                    GameAudio.Instance.Coin();
                    coin.Object.SetActive(false);
                }
            }
        }
        private void CheckHazards()
        {
            foreach (Hazard hazard in track.Hazards)
            {
                float hitZ = hazard.HitZ;
                if (hazard.Checked || !(hazard.PreviousZ > 0 && hitZ <= 0)) continue;
                hazard.Checked = true;
                float dx = Mathf.Abs(hazard.Object.transform.position.x - runner.X);
                if (hazard.Kind == HazardKind.SlidingTackle && !runner.IsInvulnerable &&
                    !powers.IsProtected && (dx > 1.12f || runner.FeetHeight > .8f))
                    session.AvoidTackle();
                if (dx > 1.12f || runner.IsInvulnerable || powers.IsProtected) continue;
                if (hazard.Kind == HazardKind.LowBarrier && runner.FeetHeight > .9f) continue;
                if (hazard.Kind == HazardKind.SlidingTackle && runner.FeetHeight > .8f) continue;
                if (hazard.Kind == HazardKind.Train && powers.Active(PowerKind.SuperShoes) && runner.FeetHeight > 2.7f) continue;
                if ((hazard.Kind == HazardKind.OverheadBeam || hazard.Kind == HazardKind.Drone) && runner.IsSliding) continue;
                if (dx > .68f) // grazing a hazard during a lane transition
                {
                    if (chaserProximity >= .35f) { Fall(); break; }
                    runner.Stumble();
                    GameAudio.Instance.Impact();
                    chaserProximity = 1f;
                }
                else { Fall(); break; } // direct frontal contact
            }
        }
        private void Fall()
        {
            runner.Fall();
            GameAudio.Instance.Impact();
            chaserCard.material.color = new Color(.95f, .19f, .18f);
            state = RunState.Replay;
            hud.ShowReplay();
            replay.Capture(.05f); // preserve the collision pose before replay moves any transforms
            StartCoroutine(replay.Play(chaseCamera, hud.UpdateReplay, OnReplayFinished));
        }
        private void OnReplayFinished()
        {
            state = RunState.Decision;
            chaser.position = new Vector3(runner.X, 0, -1.4f);
            hud.ShowDecision(session, session.NextReviveCost(config.MaximumKeysPerRevive));
        }
        public void SkipReplay() { if (state == RunState.Replay && hud.CanSkipReplay) replay.SkipRequested = true; }
        public void Revive()
        {
            if (state != RunState.Decision || !session.TrySpendRevive(config.MaximumKeysPerRevive)) return;
            runner.Revive();
            chaserCard.material.color = new Color(1f, .82f, .12f); // yellow card for consumed key
            track.ClearNearPlayerAfterRevive(difficulty.SpeedAt(session.DistanceMeters, config.StartingSpeedMetersPerSecond));
            chaserProximity = 0;
            replay.Reset();
            hud.ShowRunning();
            state = RunState.Running;
        }
        public void EndRun()
        {
            if (state != RunState.Decision || AccountSession.Instance.IsBusy) return;
            state = RunState.Ended;
            AdSession.Instance.FinishedAttempt(); // never show in the middle of a run or VAR
            long bestBefore = HubGuestProgress.Load().BestPreviewScore;
            bool cleared = HubGuestProgress.RecordFinishedRun(session.DistanceMeters, out HubProgress progress,
                session.Coins, session.Missions.Snapshot(), session.PreviewScore);
            hud.SetLocalBest(progress.BestPreviewScore);
            bool guest = AccountSession.Instance != null && !AccountSession.Instance.IsBusy &&
                !AccountSession.Instance.IsSignedIn;
            bool demoCredited = new LocalPracticeStore().CreditRun(session.RunId, session.Coins, guest);
            string saveType = AccountSession.Instance.IsSignedIn ? "ACCOUNT PREVIEW STAGE " : "LOCAL STAGE ";
            string result = cleared ?
                saveType + progress.CompletedStages + " COMPLETE" +
                    (progress.CompletedStages == HubStageProgression.UnlockMarketAndPitchAfterStages ?
                        " • MARKET & PITCH OPEN" : "") :
                "NEXT PREVIEW STAGE GOAL " + HubStageProgression.NextGoal(progress).ToString("0") + "m";
            if (session.PreviewScore > bestBefore) result += "\nNEW LOCAL PREVIEW BEST (not ranked)";
            if (demoCredited) result += "\n" + Mathf.Min(session.Coins, LocalPracticeStore.ProvisionalMaxCoinsPerRun) +
                " LOCAL DEMO COINS (not account currency)";
            hud.ShowEnd(session, result);
        }
        public void ReturnToHub()
        {
            if (transitioning || (state != RunState.Ended && state != RunState.Paused)) return;
            if (!Application.CanStreamedLevelBeLoaded("Hub"))
            {
                Debug.LogWarning("Hub scene not in Build Settings. Run Tools > Ultimate Football Chase > Build Phases 1–4 Scenes.");
                return;
            }
            transitioning = true;
            _ = ReturnToHubAfterAdAsync();
        }
        private async System.Threading.Tasks.Task ReturnToHubAfterAdAsync()
        {
            // Only future SERVER-VERIFIED remove-ads entitlement may be passed as true here.
            await AdSession.Instance.TryInterstitialBetweenAttemptsAsync(false);
            if (this != null) SceneManager.LoadScene("Hub");
            transitioning = false;
        }
        public void Pause()
        {
            if (!IsRunning) return;
            state = RunState.Paused;
            hud.ShowPaused();
        }
        public void Resume()
        {
            if (state != RunState.Paused) return;
            state = RunState.Running;
            hud.ShowRunning();
        }
        public void Restart()
        {
            if (transitioning || (state != RunState.Ended && state != RunState.Paused)) return;
            transitioning = true;
            _ = RestartAfterAdAsync();
        }
        private async System.Threading.Tasks.Task RestartAfterAdAsync()
        {
            await AdSession.Instance.TryInterstitialBetweenAttemptsAsync(false);
            if (this == null) return;
            track.ResetWorld();
            runner.ResetMotor();
            chaser.position = new Vector3(0, 0, -6f);
            chaserCard.material.color = new Color(.95f, .19f, .18f);
            chaserProximity = 0;
            session = new RunSession(config.TestOnlyStartingKeys, HubGuestProgress.Load().PreviewMissionChain);
            countedJumps = 0;
            powers.Reset();
            for (int i = 0; i < effectVisuals.Length; i++) effectVisuals[i].SetActive(false);
            replay.Reset();
            replay.Capture(.05f);
            chaseCamera.SnapNormal();
            hud.ShowRunning();
            state = RunState.Running;
            transitioning = false;
        }
    }
}
