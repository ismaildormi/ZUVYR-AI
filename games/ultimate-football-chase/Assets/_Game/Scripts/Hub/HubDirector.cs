using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.SceneManagement;
using UltimateFootballChase.Gameplay;
using UltimateFootballChase.Backend;
using UltimateFootballChase.Economy;
using UltimateFootballChase.Rankings;
using UltimateFootballChase.Settings;
using UltimateFootballChase.Characters;
using UltimateFootballChase.Missions;

namespace UltimateFootballChase.Hub
{
    /// <summary>Standalone free-roam Hub; all guest persistence here is replaced/adapted after phase-5 auth.</summary>
    public sealed class HubDirector : MonoBehaviour
    {
        [SerializeField] private HubConfig config;
        private HubProgress profile;
        private AccountSession account;
        private readonly LocalPracticeStore practiceStore = new LocalPracticeStore();
        private HubWorldBuilder world;
        private Transform player, body, cameraRig;
        private Renderer bodyRenderer;
        private HubHUD hud;
        private bool dirty;
        private float lastFlush, nextClockCheck, jumpElapsed, slideRemaining;
        private bool jumping;
        private bool day;
        private int season;
        private string nearby;
        private readonly List<Hotspot> hotspots = new List<Hotspot>();
        private static readonly string[] Seasons = { "Bloom", "Solar", "Amber", "Frost" };

        private struct Hotspot
        {
            public string Name;
            public Vector3 Position;
            public Action Action;
        }
        private void Start()
        {
            if (config == null) config = Resources.Load<HubConfig>("HubConfig");
            if (config == null)
            {
                Debug.LogWarning("HubConfig missing. Run Tools > Ultimate Football Chase > Build Phases 1–4 Scenes.");
                config = ScriptableObject.CreateInstance<HubConfig>();
            }
            Screen.orientation = ScreenOrientation.Portrait;
            account = AccountSession.Ensure();
            account.ProfileChanged += OnAccountProfileChanged;
            profile = HubGuestProgress.Load();
            GameAudio.Ensure().Apply(profile.Options);
            bool unlocked = HubStageProgression.IsExtendedHubUnlocked(profile);
            if (!HubLayout.CanWalk(profile.Position, unlocked)) profile.Position = new Vector3(0, 0, -3);
            world = new HubWorldBuilder();
            world.SetUnlocked(unlocked);
            world.SetStageTrophies(profile.CompletedStages);
            CreatePlayer();
            CreateCamera();
            hud = gameObject.AddComponent<HubHUD>();
            hud.Initialize(this);
            BuildHotspots();
            RefreshEnvironment(true);
            lastFlush = Time.unscaledTime;
        }
        private void CreatePlayer()
        {
            player = new GameObject("Free-roam 3D player, no lane constraint").transform;
            player.position = profile.Position;
            body = GreyboxFactory.Primitive("Original character outfit", PrimitiveType.Capsule, player,
                new Vector3(0, 1f, 0), new Vector3(.9f, 1f, .9f), HubWorldBuilder.OutfitColor(profile.SelectedOutfit));
            bodyRenderer = body.GetComponent<Renderer>();
            GreyboxFactory.Primitive("Original character head", PrimitiveType.Sphere, body,
                new Vector3(0, .57f, 0), new Vector3(.72f, .42f, .72f), new Color(.97f, .80f, .59f));
            OriginalRoster.AddGreyboxVariants(body);
            OriginalRoster.AddHeadwearOptions(body);
            ApplyOutfit();
        }
        private void CreateCamera()
        {
            var go = new GameObject("Hub semi-fixed camera", typeof(Camera), typeof(AudioListener));
            go.tag = "MainCamera";
            cameraRig = go.transform;
            var cam = go.GetComponent<Camera>();
            cam.fieldOfView = 58f;
            cam.nearClipPlane = .1f;
            cam.farClipPlane = 115f;
            cam.backgroundColor = new Color(.1f, .19f, .28f);
            SnapCamera();
        }
        private void SnapCamera()
        {
            cameraRig.position = player.position + new Vector3(0, 6.3f, -9.5f);
            cameraRig.LookAt(player.position + new Vector3(0, 1.1f, 5f));
        }
        private void LateUpdate()
        {
            if (cameraRig == null || player == null) return;
            // Semi-fixed behind character: same pitch/distance, yaw follows turns smoothly.
            Vector3 basePos = new Vector3(player.position.x, 0, player.position.z);
            Vector3 behind = player.rotation * new Vector3(0, 6.3f, -9.5f);
            cameraRig.position = Vector3.Lerp(cameraRig.position, basePos + behind,
                1f - Mathf.Exp(-3.5f * Time.deltaTime));
            cameraRig.LookAt(basePos + Vector3.up * 1.2f);
        }
        private void BuildHotspots()
        {
            Add("Run portal", new Vector3(0, 0, 8), StartRun);
            Add("Top 10 screen", new Vector3(6, 0, -6),
                () => hud.OpenLeaderboard(BoardKind.Weekly));
            Add("Showdown schedule", new Vector3(-6, 0, -6), () => hud.OpenShowdown());
            Add("World Legends League", new Vector3(9, 0, 5), () => hud.OpenLeague());
            Add("Wardrobe", new Vector3(-30, 0, -6), () => hud.OpenWardrobe(profile.SelectedOutfit));
            Add("Achievement wall", new Vector3(-23, 0, -9), () => hud.OpenDialogue("MY TROPHIES",
                "Completed stages: " + profile.CompletedStages + ". The 3D shelf updates with real local progress."));
            Add("Home window", new Vector3(-36, 0, 3), () => hud.OpenDialogue("REAL-TIME WINDOW",
                day ? "Daylight follows this phone's clock." : "Night follows this phone's clock."));
            Add("Practice goalkeeper", new Vector3(0, 0, 40), () => hud.OpenDialogue("PRACTICE PITCH",
                "Jump by the orange barrier; slide near the violet beam. Practice has no run penalty."));
            Add("Market gate", new Vector3(14, 0, 0), () => ShowGate("MARKET"));
            Add("Pitch gate", new Vector3(0, 0, 17), () => ShowGate("PRACTICE PITCH"));
            string[] shops = { "Characters", "Kits", "Boards" };
            int[] firstItems = { 3, 0, 4 };
            for (int i = 0; i < shops.Length; i++)
            {
                int vendor = i;
                Add(shops[i] + " vendor", new Vector3(19 + i * 6f, 0, -2.5f),
                    () => hud.OpenStore(firstItems[vendor]));
            }
        }
        private void Add(string name, Vector3 position, Action action) =>
            hotspots.Add(new Hotspot { Name = name, Position = position, Action = action });
        private void Update()
        {
            if (player == null || hud == null) return;
            world.Animate(Time.time);
            if (!account.IsBusy && (!account.IsSignedIn || account.HasActiveAccountProfile) &&
                !hud.HasModal && profile.LastStoryChapterShown < HubStory.ChapterFor(profile.CompletedStages))
            {
                int chapter = HubStory.ChapterFor(profile.CompletedStages);
                profile.LastStoryChapterShown = chapter;
                Flush();
                hud.OpenDialogue(HubStory.Title(chapter), GameText.Get("story" + chapter, profile.Options.Language));
            }
            if (Time.unscaledTime >= nextClockCheck)
            {
                nextClockCheck = Time.unscaledTime + 60f; // seasonal/daylight decoration only
                RefreshEnvironment(false);
            }
            if (!hud.HasModal && !account.IsBusy)
            {
                Move(Time.deltaTime);
                if (Input.GetKeyDown(KeyCode.Space)) PracticeJump();
                if (Input.GetKeyDown(KeyCode.LeftControl) || Input.GetKeyDown(KeyCode.C)) PracticeSlide();
                if (Input.GetKeyDown(KeyCode.E)) Interact();
            }
            else if (Input.GetKeyDown(KeyCode.Escape)) hud.CloseModal();
            AnimatePlayer(Time.deltaTime);
            Hotspot closest = ClosestHotspot();
            nearby = closest.Name;
            hud.UpdateStatus(profile, HubLayout.ZoneAt(player.position), nearby, day, Seasons[season]);
            if (dirty && Time.unscaledTime - lastFlush >= config.LocalPositionSaveIntervalSeconds) Flush();
        }
        private void Move(float dt)
        {
            Vector2 direction = hud.MoveDirection;
            if (Input.GetKey(KeyCode.A) || Input.GetKey(KeyCode.LeftArrow)) direction.x -= 1f;
            if (Input.GetKey(KeyCode.D) || Input.GetKey(KeyCode.RightArrow)) direction.x += 1f;
            if (Input.GetKey(KeyCode.W) || Input.GetKey(KeyCode.UpArrow)) direction.y += 1f;
            if (Input.GetKey(KeyCode.S) || Input.GetKey(KeyCode.DownArrow)) direction.y -= 1f;
            direction = Vector2.ClampMagnitude(direction, 1f);
            if (direction.sqrMagnitude < .0001f) return;
            // Interpret joystick relative to the current camera so turning never reverses controls.
            Vector3 forward = Vector3.ProjectOnPlane(cameraRig.forward, Vector3.up).normalized;
            Vector3 right = Vector3.ProjectOnPlane(cameraRig.right, Vector3.up).normalized;
            Vector3 heading = (right * direction.x + forward * direction.y).normalized;
            Vector3 delta = heading * (config.WalkingSpeed * direction.magnitude * Mathf.Min(dt, .05f));
            bool unlocked = HubStageProgression.IsExtendedHubUnlocked(profile);
            Vector3 candidate = new Vector3(player.position.x + delta.x, 0, player.position.z + delta.z);
            if (!HubLayout.CanWalk(candidate, unlocked))
            {
                Vector3 xOnly = new Vector3(candidate.x, 0, player.position.z);
                Vector3 zOnly = new Vector3(player.position.x, 0, candidate.z);
                candidate = HubLayout.CanWalk(xOnly, unlocked) ? xOnly :
                    HubLayout.CanWalk(zOnly, unlocked) ? zOnly : new Vector3(player.position.x, 0, player.position.z);
            }
            if (Vector2.Distance(new Vector2(candidate.x, candidate.z), new Vector2(player.position.x, player.position.z)) < .0001f) return;
            HubZone old = HubLayout.ZoneAt(player.position);
            player.position = candidate + Vector3.up * player.position.y;
            player.rotation = Quaternion.Slerp(player.rotation,
                Quaternion.LookRotation(heading), Mathf.Clamp01(12f * dt));
            profile.Position = candidate; // always keep most recent exact x/z in memory
            dirty = true;
            HubZone current = HubLayout.ZoneAt(candidate);
            if (old != current)
            {
                profile.LastDoor = current.ToString();
                Flush(); // door/zone transitions persist immediately
            }
        }
        private void AnimatePlayer(float dt)
        {
            float y = 0f;
            if (jumping)
            {
                jumpElapsed += dt;
                float t = Mathf.Clamp01(jumpElapsed / config.PracticeJumpSeconds);
                y = config.PracticeJumpHeight * 4f * t * (1f - t);
                if (t >= 1f) jumping = false;
            }
            if (slideRemaining > 0f) slideRemaining = Mathf.Max(0f, slideRemaining - dt);
            player.position = new Vector3(player.position.x, y, player.position.z);
            body.localScale = slideRemaining > 0 ? new Vector3(.9f, .48f, 1.2f) : new Vector3(.9f, 1f, .9f);
            body.localPosition = slideRemaining > 0 ? new Vector3(0, .52f, 0) : Vector3.up;
        }
        private Hotspot ClosestHotspot()
        {
            Hotspot closest = default;
            float best = config.InteractionRadius * config.InteractionRadius;
            Vector3 point = new Vector3(player.position.x, 0, player.position.z);
            bool unlocked = HubStageProgression.IsExtendedHubUnlocked(profile);
            foreach (Hotspot spot in hotspots)
            {
                if (unlocked && (spot.Name == "Market gate" || spot.Name == "Pitch gate")) continue;
                if (!unlocked && (spot.Name.EndsWith(" vendor") || spot.Name == "Practice goalkeeper")) continue;
                float distance = (spot.Position - point).sqrMagnitude;
                if (distance >= best) continue;
                best = distance;
                closest = spot;
            }
            return closest;
        }
        public void Interact()
        {
            if (hud == null || hud.HasModal || account.IsBusy) return;
            Hotspot spot = ClosestHotspot();
            spot.Action?.Invoke();
        }
        public void PracticeJump()
        {
            if (hud == null || hud.HasModal || jumping) return;
            jumping = true; jumpElapsed = 0f; slideRemaining = 0;
            if (HubLayout.ZoneAt(player.position) == HubZone.PracticePitch &&
                Vector3.Distance(new Vector3(player.position.x, 0, player.position.z), new Vector3(-3.5f, 0, 29)) < 3f)
                hud.OpenDialogue("JUMP PRACTICE", "Great timing! The low barrier can be jumped during a run.");
        }
        public void PracticeSlide()
        {
            if (hud == null || hud.HasModal || jumping) return;
            slideRemaining = config.PracticeSlideSeconds;
            if (HubLayout.ZoneAt(player.position) == HubZone.PracticePitch &&
                Vector3.Distance(new Vector3(player.position.x, 0, player.position.z), new Vector3(3.5f, 0, 29)) < 3f)
                hud.OpenDialogue("SLIDE PRACTICE", "Nice slide! Avoid high beams in the runner scene.");
        }
        public void SignIn(string provider)
        {
            if (account.IsBusy) return;
            Flush(); // persist previous identity BEFORE authentication can switch repository
            _ = account.SignInAsync(provider);
        }
        public void SignOut()
        {
            if (account.IsBusy) return;
            Flush();
            _ = account.SignOutAsync();
        }
        private void OnAccountProfileChanged(HubProgress replacement)
        {
            if (replacement == null || player == null) return;
            profile = replacement;
            dirty = false;
            bool unlocked = HubStageProgression.IsExtendedHubUnlocked(profile);
            if (!HubLayout.CanWalk(profile.Position, unlocked)) profile.Position = new Vector3(0, 0, -3);
            player.position = profile.Position;
            world.SetUnlocked(unlocked);
            world.SetStageTrophies(profile.CompletedStages);
            GameAudio.Ensure().Apply(profile.Options);
            ApplyOutfit();
            SnapCamera();
            hud.CloseModal();
        }
        public bool CanResetGuestData => account != null && !account.IsSignedIn && !account.IsBusy;
        public void ResetGuestData()
        {
            if (!CanResetGuestData) return;
            // Never call HubGuestProgress.Save on an account-bound repository during a guest reset.
            new LocalGuestHubRepository().Erase();
            practiceStore.EraseGuestDemo();
            GuestClaimMarker.ForgetGuestClaimMarkers();
            profile = new HubProgress();
            player.position = profile.Position;
            world.SetUnlocked(false);
            world.SetStageTrophies(0);
            ApplyOutfit();
            GameAudio.Ensure().Apply(profile.Options);
            dirty = false;
            hud.CloseModal();
            hud.OpenDialogue("LOCAL GUEST RESET", "Guest progress, preview missions, settings and demo wallet were reset. " +
                "UID-bound account caches/cloud profiles were not touched.");
        }
        public HubOptions CurrentOptions => profile.Options;
        public string CurrentCharacter => profile.SelectedCharacter;
        public int CompletedStages => profile.CompletedStages;
        public string SkinTone => profile.SkinToneId;
        public string Headwear => profile.HeadwearId;
        public void CycleSkinTone()
        {
            if (account.IsBusy) return;
            profile.SkinToneId = OriginalRoster.NextSkinTone(profile.SkinToneId);
            ApplyOutfit(); Flush(); hud.AppearanceSelected();
        }
        public void CycleHeadwear()
        {
            if (account.IsBusy) return;
            profile.HeadwearId = OriginalRoster.NextHeadwear(profile.HeadwearId);
            ApplyOutfit(); Flush(); hud.AppearanceSelected();
        }
        public string MissionStatus => DailyMissions.Status(profile, DateTime.UtcNow, profile.Options.Language);
        public void ChangeSetting(SettingAction action)
        {
            if (account.IsBusy || profile == null) return;
            profile.Options.Change(action);
            GameAudio.Ensure().Apply(profile.Options);
            Flush(); // guest-local OR active authenticated UID, never a shared preferences key
            hud.RefreshSettings(profile.Options);
        }
        public void SetAudioVolume(bool music, float value)
        {
            if (account.IsBusy || profile == null) return;
            if (music) profile.Options.MusicVolume = value;
            else profile.Options.SfxVolume = value;
            profile.Options.Normalize();
            GameAudio.Ensure().Apply(profile.Options);
            Flush();
            hud.RefreshSettings(profile.Options);
        }
        public void SelectCharacter(string id)
        {
            if (!OriginalRoster.Contains(id) || account.IsBusy) return;
            profile.SelectedCharacter = id;
            ApplyOutfit();
            Flush();
            hud.CharacterSelected(id);
        }
        public void SelectOutfit(string outfit)
        {
            if (account.IsBusy) return;
            if (!OriginalRoster.CanSelectKit(outfit, profile.CompletedStages))
            {
                int at = Array.IndexOf(OriginalRoster.KitIds, outfit);
                hud.OutfitLocked(outfit, at >= 0 ? OriginalRoster.KitStages[at] : -1);
                return;
            }
            if (!account.IsSignedIn) practiceStore.ClearSelection();
            profile.SelectedOutfit = outfit;
            ApplyOutfit();
            Flush(); // player appearance changes save immediately
            hud.OutfitSelected(outfit);
        }
        public string SpinPracticeWheel()
        {
            if (account.IsBusy) return "ACCOUNT RESTORING • please wait";
            // Untrusted guest-only daily spin. This never touches Firestore/account wallet.
            practiceStore.TryFreeWheelSpin(DateTime.UtcNow, !account.IsSignedIn,
                WheelDefinition.SecureDemoRoll(), out _, out string message);
            return message;
        }
        public string PracticeStoreAction(string itemId)
        {
            if (account.IsBusy) return "ACCOUNT RESTORING • please wait";
            bool guest = !account.IsSignedIn;
            if (!practiceStore.TryBuyOrEquip(itemId, profile.CompletedStages, guest, out string message))
                return message;
            ApplyOutfit();
            return message;
        }
        private void ApplyOutfit()
        {
            string selected = profile.SelectedOutfit;
            if (account != null && !account.IsSignedIn)
            {
                string demoTint = practiceStore.Load().SelectedTintId;
                if (StoreCatalog.IsDemoTint(demoTint)) selected = demoTint;
            }
            Color tint = StoreCatalog.IsDemoTint(selected) ? HubWorldBuilder.OutfitColor(selected) :
                OriginalRoster.KitColor(profile.SelectedCharacter, selected);
            bodyRenderer.material.color = tint;
            world.Mannequin.GetComponent<Renderer>().material.color = tint;
            world.BoardPreview.material.color = StoreCatalog.BoardColor(!account.IsSignedIn ?
                practiceStore.Load().SelectedBoardId : "");
            OriginalRoster.Show(body, profile.SelectedCharacter);
            OriginalRoster.Show(world.Mannequin, profile.SelectedCharacter);
            OriginalRoster.ApplyAppearance(body, profile.SkinToneId, profile.HeadwearId);
            OriginalRoster.ApplyAppearance(world.Mannequin, profile.SkinToneId, profile.HeadwearId);
        }
        private void ShowGate(string name) => hud.OpenDialogue(name + " LOCKED",
            "Complete 5 stages to open this area. Current: " + profile.CompletedStages + "/5.\nStage targets are provisional and shown at the top.");
        private void StartRun()
        {
            if (account.IsBusy) return;
            if (account.IsSignedIn && !account.HasActiveAccountProfile)
            {
                hud.OpenDialogue("CLOUD PROFILE UNAVAILABLE",
                    "No account profile was verified or cached. Retry online, or sign out to play as a local guest.");
                return;
            }
            Flush();
            if (!Application.CanStreamedLevelBeLoaded("Phase1Runner"))
            {
                hud.OpenDialogue("SCENE NOT BUILT", "Run the Tools > Ultimate Football Chase scene builder first.");
                return;
            }
            SceneManager.LoadScene("Phase1Runner");
        }
        private void RefreshEnvironment(bool force)
        {
            bool nextDay = HubLayout.IsDay(DateTime.Now.Hour);
            int nextSeason = HubLayout.SeasonAt(DateTime.UtcNow, config.SeasonCycleMonths);
            if (force || nextDay != day) { day = nextDay; world.SetDaylight(day); }
            if (force || nextSeason != season) { season = nextSeason; world.SetSeason(season); }
        }
        private void Flush()
        {
            if (profile == null) return;
            if (player != null) profile.Position = new Vector3(player.position.x, 0, player.position.z);
            HubGuestProgress.Save(profile);
            lastFlush = Time.unscaledTime;
            dirty = false;
        }
        private void OnApplicationPause(bool paused) { if (paused && profile != null) Flush(); }
        private void OnApplicationFocus(bool focused) { if (!focused && profile != null) Flush(); }
        private void OnApplicationQuit() { if (profile != null) Flush(); }
        private void OnDestroy()
        {
            if (account != null) account.ProfileChanged -= OnAccountProfileChanged;
            if (profile != null && dirty) Flush();
        }
    }
}
