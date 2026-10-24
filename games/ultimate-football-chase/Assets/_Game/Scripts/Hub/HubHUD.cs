using System;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
using UltimateFootballChase.Backend;
using UltimateFootballChase.Economy;
using UltimateFootballChase.Rankings;
using System.Text;

namespace UltimateFootballChase.Hub
{
    public sealed class HubHUD : MonoBehaviour
    {
        private HubDirector director;
        private Font font;
        private Text header, hint, modalTitle, modalText, interactionLabel;
        private GameObject modal;
        private Button interact, outfitTeal, outfitAmber, outfitViolet;
        private Button google, apple, gameCenter, signOut;
        private Button storePrevious, storeNext, storeAction, wheelSpin, wheelAd;
        private Button weeklyTab, monthlyTab, hallTab, boardRefresh, boardEntry;
        private Text wheelStatus;
        private GameObject[] wheelSlots;
        private bool accountPanel, storePanel, wheelPanel, leaderboardPanel;
        private int boardGeneration;
        private BoardKind selectedBoard;
        private readonly LeaderboardService boardService = new LeaderboardService(LeaderboardGatewayFactory.Create());
        private string wheelNote = "";
        private int storeIndex;
        private string storeNote = "";
        private readonly LocalPracticeStore practiceStore = new LocalPracticeStore();
        private HubTouchStick stick;
        private float nextTextUpdate;
        public bool HasModal => modal != null && modal.activeSelf;
        public Vector2 MoveDirection => HasModal ? Vector2.zero : stick.Direction;

        public void Initialize(HubDirector owner)
        {
            director = owner;
            font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            if (FindFirstObjectByType<EventSystem>() == null)
                new GameObject("Hub UI events", typeof(EventSystem), typeof(StandaloneInputModule)).transform.SetParent(transform);
            var go = new GameObject("Hub portrait HUD", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            go.transform.SetParent(transform, false);
            go.GetComponent<Canvas>().renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = go.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1080, 1920);
            scaler.matchWidthOrHeight = .5f;
            var root = (RectTransform)go.transform;
            var safe = new GameObject("Screen safe area", typeof(RectTransform)).GetComponent<RectTransform>();
            safe.SetParent(root, false);
            Rect bounds = Screen.safeArea;
            safe.anchorMin = new Vector2(bounds.xMin / Mathf.Max(1, Screen.width), bounds.yMin / Mathf.Max(1, Screen.height));
            safe.anchorMax = new Vector2(bounds.xMax / Mathf.Max(1, Screen.width), bounds.yMax / Mathf.Max(1, Screen.height));
            safe.offsetMin = safe.offsetMax = Vector2.zero;
            header = Label(safe, "LOCAL GUEST • offline", 36, TextAnchor.UpperCenter,
                new Vector2(0, 1), new Vector2(1, 1), new Vector2(25, -195), new Vector2(-25, -25));
            hint = Label(safe, "Interact hint", 32, TextAnchor.MiddleCenter,
                new Vector2(0, 0), new Vector2(1, 0), new Vector2(100, 480), new Vector2(-100, 580));
            interact = Button(safe, "INTERACT", new Vector2(1, 0), new Vector2(-160, 175),
                new Vector2(285, 115), () => director.Interact());
            interactionLabel = interact.GetComponentInChildren<Text>();
            Button(safe, "JUMP", new Vector2(1, 0), new Vector2(-135, 415),
                new Vector2(215, 105), () => director.PracticeJump());
            Button(safe, "SLIDE", new Vector2(1, 0), new Vector2(-135, 300),
                new Vector2(215, 105), () => director.PracticeSlide());
            Button(safe, "ACCOUNT", new Vector2(.85f, .83f), Vector2.zero,
                new Vector2(260, 95), OpenAccount);
            Button(safe, "DAILY WHEEL", new Vector2(.16f, .83f), Vector2.zero,
                new Vector2(285, 95), OpenWheel);
            BuildJoystick(safe);
            modal = new GameObject("Hub dialogue", typeof(RectTransform), typeof(Image));
            modal.transform.SetParent(root, false);
            var panel = (RectTransform)modal.transform;
            panel.anchorMin = Vector2.zero; panel.anchorMax = Vector2.one;
            panel.offsetMin = panel.offsetMax = Vector2.zero;
            modal.GetComponent<Image>().color = new Color(.02f, .06f, .11f, .9f);
            modalTitle = Label(panel, "Dialogue title", 60, TextAnchor.MiddleCenter,
                new Vector2(.1f, .64f), new Vector2(.9f, .77f), Vector2.zero, Vector2.zero);
            modalText = Label(panel, "Dialogue description", 37, TextAnchor.MiddleCenter,
                new Vector2(.1f, .40f), new Vector2(.9f, .64f), Vector2.zero, Vector2.zero);
            outfitTeal = Button(panel, "TEAL", new Vector2(.28f, .33f), Vector2.zero,
                new Vector2(230, 95), () => director.SelectOutfit("teal"));
            outfitAmber = Button(panel, "AMBER", new Vector2(.5f, .33f), Vector2.zero,
                new Vector2(230, 95), () => director.SelectOutfit("amber"));
            outfitViolet = Button(panel, "VIOLET", new Vector2(.72f, .33f), Vector2.zero,
                new Vector2(230, 95), () => director.SelectOutfit("violet"));
            google = Button(panel, "GOOGLE", new Vector2(.5f, .40f), Vector2.zero,
                new Vector2(500, 90), () => director.SignIn("google"));
            apple = Button(panel, "APPLE ID", new Vector2(.5f, .32f), Vector2.zero,
                new Vector2(500, 90), () => director.SignIn("apple"));
            gameCenter = Button(panel, "GAME CENTER", new Vector2(.5f, .24f), Vector2.zero,
                new Vector2(500, 90), () => director.SignIn("gamecenter"));
            signOut = Button(panel, "SIGN OUT", new Vector2(.5f, .34f), Vector2.zero,
                new Vector2(500, 90), director.SignOut);
            storePrevious = Button(panel, "PREVIOUS", new Vector2(.28f, .32f), Vector2.zero,
                new Vector2(370, 90), () => BrowseStore(-1));
            storeNext = Button(panel, "NEXT", new Vector2(.72f, .32f), Vector2.zero,
                new Vector2(370, 90), () => BrowseStore(1));
            storeAction = Button(panel, "EQUIP", new Vector2(.5f, .22f), Vector2.zero,
                new Vector2(520, 105), PurchaseDemoItem);
            wheelSlots = new GameObject[WheelDefinition.Weights.Count];
            for (int i = 0; i < wheelSlots.Length; i++)
            {
                var slot = new GameObject("Wheel slot " + i, typeof(RectTransform), typeof(Image));
                slot.transform.SetParent(panel, false);
                var rect = (RectTransform)slot.transform;
                rect.anchorMin = rect.anchorMax = new Vector2(i % 2 == 0 ? .28f : .72f, .605f - i / 2 * .073f);
                rect.sizeDelta = new Vector2(415, 108);
                slot.GetComponent<Image>().color = i == 7 ? new Color(.50f, .27f, .65f, .94f) :
                    i % 2 == 0 ? new Color(.11f, .40f, .49f, .94f) : new Color(.32f, .35f, .48f, .94f);
                Label(rect, WheelDefinition.Labels[i] + " • " + WheelDefinition.Weights[i] + "%",
                    27, TextAnchor.MiddleCenter, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
                wheelSlots[i] = slot;
            }
            wheelStatus = Label(panel, "Guest demo wheel", 30, TextAnchor.MiddleCenter,
                new Vector2(.08f, .30f), new Vector2(.92f, .35f), Vector2.zero, Vector2.zero);
            wheelSpin = Button(panel, "FREE DEMO SPIN", new Vector2(.5f, .235f), Vector2.zero,
                new Vector2(610, 100), SpinWheel);
            wheelAd = Button(panel, "EXTRA AD SPINS UNAVAILABLE", new Vector2(.5f, .16f), Vector2.zero,
                new Vector2(790, 90), () => { });
            wheelAd.interactable = false;
            weeklyTab = Button(panel, "WEEKLY", new Vector2(.21f, .34f), Vector2.zero,
                new Vector2(290, 85), () => SelectBoard(BoardKind.Weekly));
            monthlyTab = Button(panel, "MONTHLY", new Vector2(.5f, .34f), Vector2.zero,
                new Vector2(290, 85), () => SelectBoard(BoardKind.Monthly));
            hallTab = Button(panel, "HALL", new Vector2(.79f, .34f), Vector2.zero,
                new Vector2(290, 85), () => SelectBoard(BoardKind.Hall));
            boardRefresh = Button(panel, "RETRY SERVER READ", new Vector2(.5f, .245f), Vector2.zero,
                new Vector2(520, 90), () => SelectBoard(selectedBoard));
            boardEntry = Button(panel, "ENTRY / PRIZES UNAVAILABLE", new Vector2(.5f, .17f), Vector2.zero,
                new Vector2(720, 85), () => { });
            boardEntry.interactable = false;
            ToggleLeaderboard(false);
            ToggleAccount(false);
            ToggleStore(false);
            ToggleWheel(false);
            Button(panel, "CLOSE", new Vector2(.5f, .09f), Vector2.zero,
                new Vector2(430, 115), CloseModal);
            modal.SetActive(false);
        }
        private void BuildJoystick(RectTransform parent)
        {
            var area = new GameObject("Free-roam joystick", typeof(RectTransform), typeof(Image), typeof(HubTouchStick));
            area.transform.SetParent(parent, false);
            var rect = (RectTransform)area.transform;
            rect.anchorMin = rect.anchorMax = new Vector2(0, 0);
            rect.anchoredPosition = new Vector2(200, 210);
            rect.sizeDelta = new Vector2(300, 300);
            area.GetComponent<Image>().color = new Color(.12f, .33f, .43f, .7f);
            var knob = new GameObject("Joystick thumb", typeof(RectTransform), typeof(Image)).GetComponent<RectTransform>();
            knob.SetParent(rect, false);
            knob.anchorMin = knob.anchorMax = new Vector2(.5f, .5f);
            knob.anchoredPosition = Vector2.zero;
            knob.sizeDelta = new Vector2(95, 95);
            knob.GetComponent<Image>().color = new Color(.52f, .88f, .81f);
            knob.GetComponent<Image>().raycastTarget = false;
            stick = area.GetComponent<HubTouchStick>();
            stick.SetThumb(knob);
        }
        private Text Label(RectTransform parent, string content, int size, TextAnchor align,
            Vector2 anchorMin, Vector2 anchorMax, Vector2 bottomLeft, Vector2 topRight)
        {
            var go = new GameObject("Hub text", typeof(RectTransform), typeof(Text));
            go.transform.SetParent(parent, false);
            var rect = (RectTransform)go.transform;
            rect.anchorMin = anchorMin; rect.anchorMax = anchorMax;
            rect.offsetMin = bottomLeft; rect.offsetMax = topRight;
            var text = go.GetComponent<Text>();
            text.font = font; text.fontSize = size; text.alignment = align;
            text.supportRichText = false; // do not interpret server aliases or statuses as UI markup
            text.color = Color.white; text.raycastTarget = false;
            text.horizontalOverflow = HorizontalWrapMode.Wrap;
            text.text = content;
            return text;
        }
        private Button Button(RectTransform parent, string caption, Vector2 anchor, Vector2 offset,
            Vector2 size, Action action)
        {
            var go = new GameObject(caption, typeof(RectTransform), typeof(Image), typeof(Button));
            go.transform.SetParent(parent, false);
            var rect = (RectTransform)go.transform;
            rect.anchorMin = rect.anchorMax = anchor;
            rect.anchoredPosition = offset; rect.sizeDelta = size;
            go.GetComponent<Image>().color = new Color(.11f, .43f, .49f, .95f);
            Label(rect, caption, 32, TextAnchor.MiddleCenter, Vector2.zero, Vector2.one,
                Vector2.zero, Vector2.zero);
            var button = go.GetComponent<Button>();
            button.onClick.AddListener(() => action());
            return button;
        }
        public void UpdateStatus(HubProgress profile, HubZone zone, string nearby, bool day, string season)
        {
            if (Time.unscaledTime < nextTextUpdate) return;
            nextTextUpdate = Time.unscaledTime + .15f;
            header.text = $"{AccountSession.Instance.Status}\n{zone}  |  {season}  |  {(day ? "DAY" : "NIGHT")}\nStage {profile.CompletedStages + 1} goal {HubStageProgression.NextGoal(profile):0}m • Completed {profile.CompletedStages}";
            hint.text = string.IsNullOrEmpty(nearby) ? "MOVE FREELY • AROUND THE HUB" : "E / INTERACT: " + nearby;
            interact.gameObject.SetActive(!string.IsNullOrEmpty(nearby));
            interactionLabel.text = nearby == "Run portal" ? "START RUN" : "INTERACT";
            if (accountPanel) modalText.text = AccountSession.Instance.Status +
                "\nHub progress is preview-only; no ranked score, prize or purchase entitlement.";
            if (storePanel) RefreshStore();
            if (wheelPanel) RefreshWheel();
        }
        public void OpenDialogue(string title, string message)
        {
            modalTitle.text = title;
            modalText.text = message;
            modalText.rectTransform.anchorMin = new Vector2(.1f, .40f);
            ToggleOutfits(false);
            ToggleAccount(false);
            ToggleStore(false);
            ToggleWheel(false);
            ToggleLeaderboard(false);
            modal.SetActive(true);
        }
        public void OpenWardrobe(string selected)
        {
            modalTitle.text = "ORIGINAL 3D WARDROBE";
            modalText.text = "Prototype outfits only. Selected: " + selected + ".\nSaved to the active guest or account cache.";
            modalText.rectTransform.anchorMin = new Vector2(.1f, .40f);
            ToggleAccount(false);
            ToggleStore(false);
            ToggleWheel(false);
            ToggleLeaderboard(false);
            ToggleOutfits(true);
            modal.SetActive(true);
        }
        public void OutfitSelected(string selected) =>
            modalText.text = "Selected: " + selected + ". " + AccountSession.Instance.Status;
        public void OpenAccount()
        {
            accountPanel = true;
            modalText.rectTransform.anchorMin = new Vector2(.1f, .48f);
            modalTitle.text = "ACCOUNT & CLOUD SAVE";
            modalText.text = AccountSession.Instance.Status +
                "\nHub progress is preview-only; no ranked score, prize or purchase entitlement.";
            ToggleOutfits(false);
            ToggleStore(false);
            ToggleWheel(false);
            ToggleLeaderboard(false);
            ToggleAccount(true);
            modal.SetActive(true);
        }
        public void OpenStore(int initialItem)
        {
            storeIndex = Mathf.Clamp(initialItem, 0, StoreCatalog.Items.Length - 1);
            storeNote = "";
            modalText.rectTransform.anchorMin = new Vector2(.1f, .40f);
            ToggleOutfits(false);
            ToggleAccount(false);
            ToggleStore(true);
            ToggleWheel(false);
            ToggleLeaderboard(false);
            RefreshStore();
            modal.SetActive(true);
        }
        private void BrowseStore(int delta)
        {
            storeIndex = (storeIndex + delta + StoreCatalog.Items.Length) % StoreCatalog.Items.Length;
            storeNote = "";
            RefreshStore();
        }
        private void PurchaseDemoItem()
        {
            storeNote = director.PracticeStoreAction(StoreCatalog.Items[storeIndex].Id);
            RefreshStore();
        }
        private void RefreshStore()
        {
            StoreItem item = StoreCatalog.Items[storeIndex];
            bool guest = !AccountSession.Instance.IsSignedIn && !AccountSession.Instance.IsBusy;
            PracticeWallet wallet = practiceStore.Load();
            bool owned = Array.IndexOf(wallet.OwnedTintIds, item.Id) >= 0;
            bool demo = guest && item.Availability == StoreAvailability.GuestDemoTint;
            modalTitle.text = "MARKET • PREVIEW / GUEST DEMO";
            string currency = item.Currency == StoreCurrency.Coins ? "COINS" :
                item.Currency == StoreCurrency.Gems ? "GEMS (UNAVAILABLE)" : "IAP (UNAVAILABLE)";
            string availability = demo ? (owned ? "OWNED • TAP TO EQUIP" :
                item.ProvisionalCost + " DEMO COINS (provisional)") : "PREVIEW ONLY • NOT FOR SALE";
            modalText.text = (storeIndex + 1) + "/" + StoreCatalog.Items.Length + "  " + item.Name +
                "\n" + item.Category + " • " + currency + "\n" + availability +
                "\n" + (guest ? "GUEST DEMO BALANCE: " + wallet.DemoCoins :
                    "ACCOUNT WALLET UNAVAILABLE") +
                (string.IsNullOrEmpty(storeNote) ? "" : "\n" + storeNote);
            storeAction.gameObject.SetActive(demo);
            if (demo) storeAction.GetComponentInChildren<Text>().text = owned ? "EQUIP DEMO" : "BUY DEMO TINT";
        }
        private void ToggleStore(bool enabled)
        {
            storePanel = enabled;
            storePrevious.gameObject.SetActive(enabled);
            storeNext.gameObject.SetActive(enabled);
            storeAction.gameObject.SetActive(enabled && StoreCatalog.Items[storeIndex].Availability ==
                StoreAvailability.GuestDemoTint && !AccountSession.Instance.IsSignedIn);
        }
        public void OpenWheel()
        {
            wheelNote = "";
            ToggleOutfits(false);
            ToggleAccount(false);
            ToggleStore(false);
            ToggleLeaderboard(false);
            ToggleWheel(true);
            RefreshWheel();
            modal.SetActive(true);
        }
        private void SpinWheel()
        {
            wheelNote = director.SpinPracticeWheel();
            RefreshWheel();
        }
        private void RefreshWheel()
        {
            bool guest = !AccountSession.Instance.IsSignedIn && !AccountSession.Instance.IsBusy;
            PracticeWallet wallet = practiceStore.Load();
            bool available = guest && wallet.LastFreeSpinUtcDay < WheelDefinition.UtcDay(DateTime.UtcNow);
            modalTitle.text = "DAILY WHEEL • LOCAL DEMO";
            string info = !string.IsNullOrEmpty(wheelNote) ? wheelNote : !guest ?
                "ACCOUNT SPIN UNAVAILABLE • no trusted wallet" : available ?
                "One free guest demo spin per UTC day; NOT real prizes" :
                "Free demo spin used • next UTC day";
            wheelStatus.text = guest ? info + "\nDemo coins " + wallet.DemoCoins +
                " • simulated keys " + wallet.SimulatedKeys + " / gems " + wallet.SimulatedGems +
                " / boxes " + wallet.SimulatedBoxes : info;
            wheelSpin.gameObject.SetActive(guest);
            wheelSpin.interactable = available;
            if (guest) wheelSpin.GetComponentInChildren<Text>().text = available ? "FREE DEMO SPIN" : "USED TODAY";
            for (int i = 0; i < wheelSlots.Length; i++)
                wheelSlots[i].GetComponent<Image>().color = guest && wallet.LastFreeSpinUtcDay > 0 &&
                    wallet.LastWheelSlot == i ? new Color(.97f, .69f, .23f, .95f) :
                    i == 7 ? new Color(.50f, .27f, .65f, .94f) :
                    i % 2 == 0 ? new Color(.11f, .40f, .49f, .94f) : new Color(.32f, .35f, .48f, .94f);
        }
        private void ToggleWheel(bool enabled)
        {
            wheelPanel = enabled;
            foreach (GameObject slot in wheelSlots) slot.SetActive(enabled);
            wheelStatus.gameObject.SetActive(enabled);
            wheelSpin.gameObject.SetActive(enabled);
            wheelAd.gameObject.SetActive(enabled);
            modalText.gameObject.SetActive(!enabled);
        }
        public void OpenLeaderboard(BoardKind kind)
        {
            ToggleOutfits(false);
            ToggleAccount(false);
            ToggleStore(false);
            ToggleWheel(false);
            ToggleLeaderboard(true);
            modalText.rectTransform.anchorMin = new Vector2(.08f, .38f);
            modalText.rectTransform.anchorMax = new Vector2(.92f, .63f);
            modalText.fontSize = 29;
            modal.SetActive(true);
            SelectBoard(kind);
        }
        private void SelectBoard(BoardKind kind)
        {
            if (!leaderboardPanel) return;
            selectedBoard = kind;
            int request = ++boardGeneration;
            modalTitle.text = kind == BoardKind.Weekly ? "WEEKLY TOP 10" :
                kind == BoardKind.Monthly ? "MONTHLY CHALLENGE" : "HALL OF CHAMPIONS";
            modalText.text = "Checking server-published standings...\nLocal guest/account Hub scores are NEVER ranked.";
            boardEntry.gameObject.SetActive(kind == BoardKind.Monthly);
            _ = LoadBoardAsync(kind, request);
        }
        private async System.Threading.Tasks.Task LoadBoardAsync(BoardKind kind, int request)
        {
            BoardLoadResult loaded = await boardService.LoadAsync(kind);
            if (this == null || !leaderboardPanel || boardGeneration != request) return;
            if (loaded.Snapshot == null)
            {
                modalText.text = loaded.Status + "\nNo invented scores or winners.\n" +
                    (kind == BoardKind.Monthly ? "Monthly entry and cash prizes are DISABLED." :
                        "Local Hub progress is not a ranking.");
                return;
            }
            LeaderboardSnapshot view = loaded.Snapshot;
            var display = new StringBuilder(loaded.Status);
            display.Append("\nPeriod ").Append(view.PeriodKey).Append(" • ").Append(view.State);
            display.Append("\nPublished ").Append(new DateTime(view.PublishedUtcTicks, DateTimeKind.Utc)
                .ToString("yyyy-MM-dd HH:mm 'UTC'"));
            if (view.Entries.Length == 0)
                display.Append("\nNo server-published ranked entries for this period.");
            foreach (RankedEntry row in view.Entries)
                display.Append("\n").Append(row.Rank).Append(". ").Append(row.Alias)
                    .Append(" — ").Append(row.Points);
            modalText.text = display.ToString();
        }
        private void ToggleLeaderboard(bool enabled)
        {
            leaderboardPanel = enabled;
            if (!enabled) boardGeneration++; // invalidate late server completions
            weeklyTab.gameObject.SetActive(enabled);
            monthlyTab.gameObject.SetActive(enabled);
            hallTab.gameObject.SetActive(enabled);
            boardRefresh.gameObject.SetActive(enabled);
            boardEntry.gameObject.SetActive(enabled && selectedBoard == BoardKind.Monthly);
            if (!enabled)
            {
                modalText.fontSize = 37;
                modalText.rectTransform.anchorMax = new Vector2(.9f, .64f);
            }
        }
        private void ToggleAccount(bool enabled)
        {
            accountPanel = enabled;
            bool available = enabled && AccountSession.Instance.IsConfigured;
            bool signedIn = enabled && AccountSession.Instance.IsSignedIn;
            google.gameObject.SetActive(available && !signedIn);
            apple.gameObject.SetActive(available && !signedIn && Application.platform == RuntimePlatform.IPhonePlayer);
            gameCenter.gameObject.SetActive(available && !signedIn && Application.platform == RuntimePlatform.IPhonePlayer);
            signOut.gameObject.SetActive(signedIn);
        }
        private void ToggleOutfits(bool enabled)
        {
            outfitTeal.gameObject.SetActive(enabled);
            outfitAmber.gameObject.SetActive(enabled);
            outfitViolet.gameObject.SetActive(enabled);
        }
        public void CloseModal()
        {
            accountPanel = false; storePanel = false; wheelPanel = false;
            ToggleLeaderboard(false);
            modal.SetActive(false);
        }
    }
}
