using System;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
using UltimateFootballChase.Core;
using UltimateFootballChase.Gameplay;
using UltimateFootballChase.PowerUps;
using UltimateFootballChase.Settings;
using UltimateFootballChase.Visuals;
using System.Collections.Generic;

namespace UltimateFootballChase.UI
{
    /// <summary>Generated greybox HUD. Ads and remotely trusted balances are unavailable.</summary>
    public sealed class GameHUD : MonoBehaviour
    {
        private Text statistics, missionLabel, bestBadge, chase, title, detail, primaryLabel, secondaryLabel;
        private long localBest;
        private string language = "en";
        private string T(string key) => GameText.Get(key, language);
        private GameObject modal, replaySkip;
        private Button primary, secondary, pause;
        private Font font;
        private VisualCatalog visualCatalog;
        private readonly Text[] powerLabels = new Text[4];
        private readonly Image[] powerBars = new Image[4];
        private readonly Text[] previewLabels = new Text[3];
        private readonly Image[] previewBackgrounds = new Image[3];
        private readonly List<UpcomingEvent> previewBuffer = new List<UpcomingEvent>(24);
        private float nextPreviewRefresh;
        private float nextPowerRefresh;
        private float nextStatisticsRefresh;
        private GameDirector director;
        private float visibleReplaySeconds;
        public bool CanSkipReplay => visibleReplaySeconds >= 1f;

        public void Initialize(GameDirector owner)
        {
            director = owner;
            // Unity 6 built-in legacy font; this does not require external assets.
            visualCatalog = Resources.Load<VisualCatalog>("VisualCatalog");
            font = visualCatalog != null && visualCatalog.UiFont != null ? visualCatalog.UiFont :
                Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            if (FindFirstObjectByType<EventSystem>() == null)
            {
                var eventSystem = new GameObject("UI Event System", typeof(EventSystem), typeof(StandaloneInputModule));
                eventSystem.transform.SetParent(transform, false);
            }
            var canvasGo = new GameObject("Portrait HUD", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            canvasGo.transform.SetParent(transform, false);
            var canvas = canvasGo.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 100;
            var scaler = canvasGo.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1080, 1920);
            scaler.matchWidthOrHeight = .5f;
            RectTransform root = canvasGo.GetComponent<RectTransform>();
            var safeGo = new GameObject("HUD safe area", typeof(RectTransform));
            safeGo.transform.SetParent(root, false);
            RectTransform safe = safeGo.GetComponent<RectTransform>();
            Rect bounds = Screen.safeArea;
            safe.anchorMin = new Vector2(bounds.xMin / Mathf.Max(1, Screen.width), bounds.yMin / Mathf.Max(1, Screen.height));
            safe.anchorMax = new Vector2(bounds.xMax / Mathf.Max(1, Screen.width), bounds.yMax / Mathf.Max(1, Screen.height));
            safe.offsetMin = safe.offsetMax = Vector2.zero;
            statistics = Label(safe, "Distance / coins / keys", 31, TextAnchor.UpperRight,
                new Vector2(.45f, 1), new Vector2(1, 1), new Vector2(0, -185), new Vector2(-35, -35));
            missionLabel = Label(safe, "Current local mission", 27, TextAnchor.UpperLeft,
                new Vector2(0, 1), new Vector2(.53f, 1), new Vector2(25, -235), new Vector2(0, -145));
            bestBadge = Label(safe, "Local best", 30, TextAnchor.MiddleRight,
                new Vector2(.48f, 1), new Vector2(1, 1), new Vector2(0, -255), new Vector2(-35, -195));
            chase = Label(safe, "Chaser", 35, TextAnchor.MiddleCenter, new Vector2(0, 1), new Vector2(1, 1),
                new Vector2(140, -325), new Vector2(-140, -270));
            pause = MakeButton(safe, "II", new Vector2(0, 1), new Vector2(80, -80), new Vector2(115, 115), () => director.Pause());
            pause.GetComponent<Image>().color = new Color(.03f, .07f, .11f, .85f);
            CreatePowerMeters(safe);
            CreateUpcomingPreview(safe);
            replaySkip = MakeButton(safe, "VAR REPLAY - tap to skip after 1s", new Vector2(.5f, 0),
                new Vector2(0, 165), new Vector2(840, 110), () => director.SkipReplay()).gameObject;
            replaySkip.SetActive(false);
            modal = new GameObject("Modal backdrop", typeof(RectTransform), typeof(Image));
            modal.transform.SetParent(root, false);
            RectTransform panel = modal.GetComponent<RectTransform>();
            panel.anchorMin = Vector2.zero; panel.anchorMax = Vector2.one;
            panel.offsetMin = panel.offsetMax = Vector2.zero;
            modal.GetComponent<Image>().color = visualCatalog != null ? visualCatalog.BackdropColor :
                new Color(.01f, .04f, .09f, .88f);
            title = Label(panel, "", 68, TextAnchor.MiddleCenter, new Vector2(.08f, .57f), new Vector2(.92f, .77f), Vector2.zero, Vector2.zero);
            detail = Label(panel, "", 38, TextAnchor.MiddleCenter, new Vector2(.08f, .38f), new Vector2(.92f, .57f), Vector2.zero, Vector2.zero);
            primary = MakeButton(panel, "", new Vector2(.5f, .29f), new Vector2(0, -15), new Vector2(780, 122), null);
            primaryLabel = primary.GetComponentInChildren<Text>();
            secondary = MakeButton(panel, "", new Vector2(.5f, .19f), new Vector2(0, -15), new Vector2(780, 122), null);
            secondaryLabel = secondary.GetComponentInChildren<Text>();
            modal.SetActive(false);
        }
        private void CreatePowerMeters(RectTransform parent)
        {
            for (int i = 0; i < 4; i++)
            {
                var slot = new GameObject("Power timer " + (PowerKind)i, typeof(RectTransform), typeof(Image));
                slot.transform.SetParent(parent, false);
                RectTransform rect = slot.GetComponent<RectTransform>();
                rect.anchorMin = rect.anchorMax = new Vector2(0, 0);
                rect.anchoredPosition = new Vector2(240, 390 - i * 76);
                rect.sizeDelta = new Vector2(430, 66);
                slot.GetComponent<Image>().color = new Color(.03f, .10f, .17f, .83f);
                var bar = new GameObject("Remaining time", typeof(RectTransform), typeof(Image));
                bar.transform.SetParent(rect, false);
                RectTransform fill = bar.GetComponent<RectTransform>();
                fill.anchorMin = new Vector2(.02f, .08f); fill.anchorMax = new Vector2(.98f, .23f);
                fill.offsetMin = fill.offsetMax = Vector2.zero;
                powerBars[i] = bar.GetComponent<Image>();
                powerBars[i].type = Image.Type.Filled;
                powerBars[i].fillMethod = Image.FillMethod.Horizontal;
                powerBars[i].color = TrackWorld.PowerColor((PowerKind)i);
                var iconGo = new GameObject("Power icon", typeof(RectTransform), typeof(Image));
                iconGo.transform.SetParent(rect, false);
                RectTransform icon = iconGo.GetComponent<RectTransform>();
                icon.anchorMin = new Vector2(.025f, .28f); icon.anchorMax = new Vector2(.13f, .92f);
                icon.offsetMin = icon.offsetMax = Vector2.zero;
                iconGo.GetComponent<Image>().color = TrackWorld.PowerColor((PowerKind)i);
                Label(icon, ((PowerKind)i).ToString().Substring(0, 1), 28, TextAnchor.MiddleCenter,
                    Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero).color = Color.black;
                powerLabels[i] = Label(rect, "Power name / countdown", 28, TextAnchor.MiddleCenter,
                    new Vector2(.15f, .25f), new Vector2(.98f, .98f), Vector2.zero, Vector2.zero);
            }
        }
        private void CreateUpcomingPreview(RectTransform parent)
        {
            for (int i = 0; i < 3; i++)
            {
                var item = new GameObject("Upcoming item " + (i + 1), typeof(RectTransform), typeof(Image));
                item.transform.SetParent(parent, false);
                RectTransform rect = item.GetComponent<RectTransform>();
                rect.anchorMin = rect.anchorMax = new Vector2(.5f, 1f);
                rect.anchoredPosition = new Vector2((i - 1) * 260f, -360f);
                rect.sizeDelta = new Vector2(245f, 105f);
                previewBackgrounds[i] = item.GetComponent<Image>();
                previewLabels[i] = Label(rect, "Event name / distance", 25, TextAnchor.MiddleCenter,
                    Vector2.zero, Vector2.one, new Vector2(5, 3), new Vector2(-5, -3));
            }
        }
        public void UpdatePowers(PowerUpState state)
        {
            if (Time.unscaledTime < nextPowerRefresh) return;
            nextPowerRefresh = Time.unscaledTime + .1f; // reduce string allocations/UI layout churn
            for (int i = 0; i < powerLabels.Length; i++)
            {
                PowerKind kind = (PowerKind)i;
                float remaining = state.Remaining(kind);
                bool stockedBoard = kind == PowerKind.Hoverboard && state.BoardCharges > 0;
                powerLabels[i].text = remaining > 0f ? $"{kind}  {remaining:0.0}s" :
                    stockedBoard ? $"BOARD x{state.BoardCharges} • DOUBLE TAP" : kind + " —";
                powerBars[i].fillAmount = remaining > 0f ? remaining / state.Duration(kind) : stockedBoard ? 1f : 0f;
                powerLabels[i].color = remaining > 0f || stockedBoard ? Color.white : new Color(.54f, .64f, .69f);
            }
        }
        public void UpdatePreview(TrackWorld track)
        {
            if (Time.unscaledTime < nextPreviewRefresh) return;
            nextPreviewRefresh = Time.unscaledTime + .12f; // provisional HUD refresh; not every render frame
            track.FillUpcoming(previewBuffer);
            for (int i = 0; i < previewLabels.Length; i++)
            {
                bool upcoming = i < previewBuffer.Count;
                previewBackgrounds[i].color = upcoming ? previewBuffer[i].Tint * new Color(.55f, .55f, .55f, 1f) :
                    new Color(.06f, .11f, .15f, .8f);
                previewLabels[i].text = upcoming ? $"{previewBuffer[i].Name}\n{previewBuffer[i].Distance:0}m  " +
                    (previewBuffer[i].Lane < 0 ? "REWARD" : $"LANE {previewBuffer[i].Lane + 1}") : "—";
            }
        }
        private Text Label(RectTransform parent, string name, int size, TextAnchor alignment,
            Vector2 min, Vector2 max, Vector2 offsetMin, Vector2 offsetMax)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Text));
            go.transform.SetParent(parent, false);
            var rect = go.GetComponent<RectTransform>();
            rect.anchorMin = min; rect.anchorMax = max;
            rect.offsetMin = offsetMin; rect.offsetMax = offsetMax;
            Text text = go.GetComponent<Text>();
            text.font = font; text.fontSize = size; text.alignment = alignment;
            text.color = Color.white;
            text.horizontalOverflow = HorizontalWrapMode.Wrap;
            return text;
        }
        private Button MakeButton(RectTransform parent, string caption, Vector2 anchor, Vector2 position, Vector2 size, Action onClick)
        {
            var go = new GameObject(caption, typeof(RectTransform), typeof(Image), typeof(Button));
            go.transform.SetParent(parent, false);
            var rect = go.GetComponent<RectTransform>();
            rect.anchorMin = rect.anchorMax = anchor;
            rect.anchoredPosition = position;
            rect.sizeDelta = size;
            go.GetComponent<Image>().color = visualCatalog != null ? visualCatalog.ButtonColor :
                new Color(.06f, .43f, .49f, .95f);
            var text = Label(rect, caption, 38, TextAnchor.MiddleCenter, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            text.raycastTarget = false;
            Button button = go.GetComponent<Button>();
            if (onClick != null) button.onClick.AddListener(() => onClick());
            return button;
        }
        private void SetButtons(string first, Action firstAction, string second, Action secondAction)
        {
            primary.gameObject.SetActive(firstAction != null);
            secondary.gameObject.SetActive(secondAction != null);
            primaryLabel.text = first;
            secondaryLabel.text = second;
            primary.onClick.RemoveAllListeners();
            secondary.onClick.RemoveAllListeners();
            if (firstAction != null) primary.onClick.AddListener(() => firstAction());
            if (secondAction != null) secondary.onClick.AddListener(() => secondAction());
        }
        public void SetLocalBest(long score) => localBest = Math.Max(0L, score);
        public void SetLanguage(string selected) => language = selected == "ar" || selected == "fr" ? selected : "en";
        public void UpdateRun(RunSession session, float chaserProximity, float speed, int difficultyTier)
        {
            if (Time.unscaledTime < nextStatisticsRefresh) return;
            nextStatisticsRefresh = Time.unscaledTime + .1f;
            statistics.text = $"{T("localScore")} {session.PreviewScore:N0}  x{session.Missions.Multiplier} [{T("unverified")}]\n" +
                $"{session.DistanceMeters:0} m  {speed:0.0} m/s  T{difficultyTier + 1}\n" +
                $"{T("coins")} {session.Coins} [demo]  {T("testKeys")} {session.Keys}";
            var chain = session.Missions;
            missionLabel.text = chain.Multiplier == 30 ? T("mission") + " x30\n" + T("previewCap") :
                $"{T("mission")} {chain.Group + 1} • x{chain.Multiplier} [LOCAL]\n" +
                $"{T("jump")} {chain.Jumps}/15  {T("dodge")} {chain.AvoidedTackles}/10\n" +
                $"{T("coins")} {chain.Coins}/100";
            bestBadge.text = T("topRun") + " " + Math.Max(localBest, session.PreviewScore).ToString("N0");
            bestBadge.color = localBest > 0 && session.PreviewScore >= localBest * .9d
                ? new Color(1f, .79f, .24f) : Color.white;
            chase.text = chaserProximity > 0 ? T("chaser") : "";
        }
        public void ShowReplay()
        {
            pause.gameObject.SetActive(false);
            visibleReplaySeconds = 0;
            replaySkip.SetActive(true);
        }
        public void UpdateReplay(float ignored)
        {
            visibleReplaySeconds += Time.unscaledDeltaTime;
            replaySkip.GetComponentInChildren<Text>().text = visibleReplaySeconds < 1f
                ? "VAR REPLAY  |  SKIP IN 1 SECOND" : "VAR REPLAY  |  TAP TO SKIP";
        }
        public void ShowDecision(RunSession session, int cost)
        {
            replaySkip.SetActive(false);
            modal.SetActive(true);
            title.text = session.Keys >= cost ? "VAR REVIEW\nYELLOW CARD?" : "VAR REVIEW\nRED CARD";
            detail.text = $"Foul at {session.DistanceMeters:0} m.\nTest keys: {session.Keys}. Revive cost: {cost}.\nRewarded revive unavailable (no ad SDK).";
            SetButtons(session.Keys >= cost ? $"USE {cost} KEY(S) - CONTINUE" : "",
                session.Keys >= cost ? (Action)(() => director.Revive()) : null,
                "ACCEPT RED CARD", () => director.EndRun());
        }
        public void ShowEnd(RunSession session, string stageOutcome)
        {
            modal.SetActive(true);
            title.text = T("gameOver");
            detail.text = $"Distance: {session.DistanceMeters:0} m • Local score: {session.PreviewScore:N0} x{session.Missions.Multiplier}\n" +
                $"Run coins (unverified): {session.Coins}\n{stageOutcome}\nRewarded x2 unavailable.";
            SetButtons(T("runAgain"), () => director.Restart(), T("backHub"), () => director.ReturnToHub());
        }
        public void ShowPaused()
        {
            modal.SetActive(true);
            title.text = T("pause");
            detail.text = "Swipe to change lane, jump or slide.\nDouble tap to use a stocked hoverboard.\nActive power timers pause with your run.";
            SetButtons(T("resume"), () => director.Resume(), T("restart"), () => director.Restart());
        }
        public void ShowProfileUnavailable()
        {
            pause.gameObject.SetActive(false);
            modal.SetActive(true);
            title.text = "CLOUD PROFILE UNAVAILABLE";
            detail.text = "This signed-in profile was not verified or cached. No run can be credited. " +
                "Return to the Hub and retry online or sign out to play locally.";
            SetButtons(T("backHub"), () => director.ReturnToHub(), "", null);
        }
        public void ShowRunning()
        {
            modal.SetActive(false); replaySkip.SetActive(false);
            pause.gameObject.SetActive(true);
        }
    }
}
