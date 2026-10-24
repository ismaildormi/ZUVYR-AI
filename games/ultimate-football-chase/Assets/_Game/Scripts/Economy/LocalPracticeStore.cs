using System;
using System.Collections.Generic;
using UnityEngine;

namespace UltimateFootballChase.Economy
{
    [Serializable]
    public sealed class PracticeWallet
    {
        public int SchemaVersion = 1;
        public int DemoCoins;
        // Spin results are untrusted DEMO counters. Never use as runner revival keys or premium gems.
        public int SimulatedKeys;
        public int SimulatedGems;
        public int SimulatedBoxes;
        public long LastFreeSpinUtcDay;
        public int LastWheelSlot = -1;
        public string SelectedTintId = "";
        public string[] OwnedTintIds = Array.Empty<string>();
        public string[] CreditedRunIds = Array.Empty<string>();
    }

    /// <summary>
    /// Guest-only, untrusted LOCAL GREYBOX DEMO, unrelated to Firebase, IAP or prize economy.
    /// Not imported into accounts; wheel keys/gems/boxes are display-only simulated counters.
    /// </summary>
    public sealed class LocalPracticeStore
    {
        public const string GuestKey = "ufc.practice.guest.store.v1";
        public const int ProvisionalMaxCoinsPerRun = 200;
        public const int ProvisionalWalletCap = 100000;
        private const int ReceiptWindow = 64;

        public PracticeWallet Load()
        {
            try
            {
                string json = PlayerPrefs.GetString(GuestKey, "");
                PracticeWallet saved = string.IsNullOrEmpty(json) ? null : JsonUtility.FromJson<PracticeWallet>(json);
                if (saved == null || saved.SchemaVersion != 1) return new PracticeWallet();
                saved.DemoCoins = Mathf.Clamp(saved.DemoCoins, 0, ProvisionalWalletCap);
                saved.SimulatedKeys = Mathf.Clamp(saved.SimulatedKeys, 0, 10000);
                saved.SimulatedGems = Mathf.Clamp(saved.SimulatedGems, 0, 10000);
                saved.SimulatedBoxes = Mathf.Clamp(saved.SimulatedBoxes, 0, 10000);
                if (saved.LastFreeSpinUtcDay < 0 || saved.LastFreeSpinUtcDay > 99991231)
                    saved.LastFreeSpinUtcDay = 0;
                if (saved.LastWheelSlot < -1 || saved.LastWheelSlot >= WheelDefinition.Weights.Count)
                    saved.LastWheelSlot = -1;
                if (saved.OwnedTintIds == null) saved.OwnedTintIds = Array.Empty<string>();
                if (saved.CreditedRunIds == null) saved.CreditedRunIds = Array.Empty<string>();
                var owned = new HashSet<string>();
                foreach (string id in saved.OwnedTintIds) if (StoreCatalog.IsDemoTint(id)) owned.Add(id);
                saved.OwnedTintIds = new List<string>(owned).ToArray();
                if (!owned.Contains(saved.SelectedTintId)) saved.SelectedTintId = "";
                if (saved.CreditedRunIds.Length > ReceiptWindow)
                    saved.CreditedRunIds = new List<string>(saved.CreditedRunIds).GetRange(
                        saved.CreditedRunIds.Length - ReceiptWindow, ReceiptWindow).ToArray();
                return saved;
            }
            catch (Exception ex)
            {
                Debug.LogWarning("Practice-only wallet unreadable: " + ex.Message);
                return new PracticeWallet();
            }
        }
        private void Save(PracticeWallet value)
        {
            PlayerPrefs.SetString(GuestKey, JsonUtility.ToJson(value));
            PlayerPrefs.Save();
        }
        public bool CreditRun(string runId, int collectedCoins, bool guest)
        {
            // Caller-provided values are intentionally NOT trustworthy. This is a demo reward only.
            if (!guest || !Guid.TryParse(runId, out _) || collectedCoins <= 0) return false;
            PracticeWallet state = Load();
            if (Array.IndexOf(state.CreditedRunIds, runId) >= 0) return false;
            state.DemoCoins = Mathf.Min(ProvisionalWalletCap,
                state.DemoCoins + Mathf.Clamp(collectedCoins, 0, ProvisionalMaxCoinsPerRun));
            var receipts = new List<string>(state.CreditedRunIds) { runId };
            if (receipts.Count > ReceiptWindow) receipts.RemoveAt(0);
            state.CreditedRunIds = receipts.ToArray();
            Save(state);
            return true;
        }
        public bool TryBuyOrEquip(string itemId, int completedStages, bool guest, out string message)
        {
            StoreItem item = StoreCatalog.Find(itemId);
            if (item == null || item.Availability != StoreAvailability.GuestDemoTint ||
                item.Currency != StoreCurrency.Coins)
            {
                message = "PREVIEW ONLY • no real purchase or premium currency is enabled";
                return false;
            }
            if (!guest)
            {
                message = "ACCOUNT STORE UNAVAILABLE • no trusted wallet or purchase service";
                return false;
            }
            if (completedStages < 5)
            {
                message = "MARKET LOCKED • finish five separate stages first";
                return false;
            }
            PracticeWallet state = Load();
            if (Array.IndexOf(state.OwnedTintIds, itemId) < 0)
            {
                if (state.DemoCoins < item.ProvisionalCost)
                {
                    message = "NOT ENOUGH DEMO COINS • play more guest runs";
                    return false;
                }
                state.DemoCoins -= item.ProvisionalCost;
                var owned = new List<string>(state.OwnedTintIds) { itemId };
                state.OwnedTintIds = owned.ToArray();
            }
            state.SelectedTintId = itemId;
            Save(state); // balance, ownership and selection are one PlayerPrefs snapshot
            message = "EQUIPPED • LOCAL GUEST DEMO ONLY";
            return true;
        }
        public bool TryFreeWheelSpin(DateTime nowUtc, bool guest, int roll,
            out WheelPrize prize, out string message)
        {
            prize = default;
            if (!guest)
            {
                message = "ACCOUNT WHEEL UNAVAILABLE • no server ledger";
                return false;
            }
            if (nowUtc.Kind != DateTimeKind.Utc || roll < 0 || roll >= 100)
            {
                message = "INVALID WHEEL REQUEST";
                return false;
            }
            PracticeWallet state = Load();
            long day = WheelDefinition.UtcDay(nowUtc);
            if (state.LastFreeSpinUtcDay >= day)
            {
                message = "FREE DEMO SPIN USED • next UTC day (clock changes are not trusted)";
                return false;
            }
            prize = WheelDefinition.ResultForRoll(roll);
            switch (prize)
            {
                case WheelPrize.Coin50: state.DemoCoins = Mathf.Min(ProvisionalWalletCap, state.DemoCoins + 50); break;
                case WheelPrize.Coin100: state.DemoCoins = Mathf.Min(ProvisionalWalletCap, state.DemoCoins + 100); break;
                case WheelPrize.Coin200: state.DemoCoins = Mathf.Min(ProvisionalWalletCap, state.DemoCoins + 200); break;
                case WheelPrize.Key1: state.SimulatedKeys = Mathf.Min(10000, state.SimulatedKeys + 1); break;
                case WheelPrize.Key3: state.SimulatedKeys = Mathf.Min(10000, state.SimulatedKeys + 3); break;
                case WheelPrize.Key10: state.SimulatedKeys = Mathf.Min(10000, state.SimulatedKeys + 10); break;
                case WheelPrize.BasicBox: state.SimulatedBoxes = Mathf.Min(10000, state.SimulatedBoxes + 1); break;
                case WheelPrize.Gem5: state.SimulatedGems = Mathf.Min(10000, state.SimulatedGems + 5); break;
            }
            state.LastFreeSpinUtcDay = day;
            state.LastWheelSlot = (int)prize;
            Save(state); // day gate and outcome in the SAME local snapshot
            message = "DEMO RESULT: " + WheelDefinition.Labels[(int)prize] +
                (prize == WheelPrize.Coin50 || prize == WheelPrize.Coin100 || prize == WheelPrize.Coin200 ?
                    " • guest demo coins only" : " • simulated counter only, NOT spendable");
            return true;
        }
        public void ClearSelection()
        {
            PracticeWallet state = Load();
            state.SelectedTintId = "";
            Save(state);
        }
    }
}
