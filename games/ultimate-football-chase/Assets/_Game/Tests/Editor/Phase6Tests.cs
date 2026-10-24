using System;
using NUnit.Framework;
using UnityEngine;
using UltimateFootballChase.Core;
using UltimateFootballChase.Economy;

namespace UltimateFootballChase.Tests
{
    public sealed class Phase6Tests
    {
        private bool hadWallet;
        private string originalWallet;
        private LocalPracticeStore store;
        [SetUp]
        public void Setup()
        {
            hadWallet = PlayerPrefs.HasKey(LocalPracticeStore.GuestKey);
            originalWallet = PlayerPrefs.GetString(LocalPracticeStore.GuestKey, "");
            PlayerPrefs.DeleteKey(LocalPracticeStore.GuestKey);
            store = new LocalPracticeStore();
        }
        [TearDown]
        public void Cleanup()
        {
            if (hadWallet) PlayerPrefs.SetString(LocalPracticeStore.GuestKey, originalWallet);
            else PlayerPrefs.DeleteKey(LocalPracticeStore.GuestKey);
        }
        [Test]
        public void CatalogIsSixRegularFourPremium_AndOnlyThreeGuestDemoTintsCanBeBought()
        {
            int ordinary = 0, premium = 0, demos = 0;
            var unique = new System.Collections.Generic.HashSet<string>();
            foreach (StoreItem item in StoreCatalog.Items)
            {
                Assert.IsTrue(unique.Add(item.Id));
                if (item.Currency == StoreCurrency.Coins) ordinary++;
                else premium++;
                if (item.Availability != StoreAvailability.GuestDemoTint) continue;
                demos++;
                Assert.AreEqual(StoreCurrency.Coins, item.Currency);
                Assert.Greater(item.ProvisionalCost, 0);
            }
            Assert.AreEqual(6, ordinary);
            Assert.AreEqual(4, premium);
            Assert.AreEqual(3, demos);
        }
        [Test]
        public void RunPayoutIsGuestOnlyBoundedAndIdempotent()
        {
            var run = new RunSession(3);
            Assert.IsFalse(store.CreditRun(run.RunId, 200, false));
            Assert.IsTrue(store.CreditRun(run.RunId, 2000, true));
            Assert.AreEqual(LocalPracticeStore.ProvisionalMaxCoinsPerRun, store.Load().DemoCoins);
            Assert.IsFalse(store.CreditRun(run.RunId, 100, true));
            Assert.IsFalse(store.CreditRun("not-a-run-id", 100, true));
            Assert.IsFalse(store.CreditRun(new RunSession(0).RunId, -1, true));
            Assert.AreEqual(LocalPracticeStore.ProvisionalMaxCoinsPerRun, store.Load().DemoCoins);
        }
        [Test]
        public void PreviewPremiumAndAccountsCannotSpendLocalDemoBalance()
        {
            Assert.IsTrue(store.CreditRun(new RunSession(0).RunId, 200, true));
            int original = store.Load().DemoCoins;
            Assert.IsFalse(store.TryBuyOrEquip("fictional_legend_kit", 5, true, out _));
            Assert.IsFalse(store.TryBuyOrEquip("comet_board", 5, true, out _));
            Assert.IsFalse(store.TryBuyOrEquip("cobalt", 5, false, out _));
            Assert.IsFalse(store.TryBuyOrEquip("cobalt", 4, true, out _));
            Assert.IsFalse(store.TryBuyOrEquip("unknown_item", 5, true, out _));
            Assert.AreEqual(original, store.Load().DemoCoins);
            Assert.AreEqual(0, store.Load().OwnedTintIds.Length);
        }
        [Test]
        public void GuestCanBuyAndEquipGreyboxTintOnce_WithoutDoubleCharge()
        {
            Assert.IsTrue(store.CreditRun(new RunSession(0).RunId, 200, true));
            Assert.IsTrue(store.TryBuyOrEquip("cobalt", 5, true, out _));
            Assert.AreEqual(125, store.Load().DemoCoins);
            Assert.AreEqual("cobalt", store.Load().SelectedTintId);
            Assert.IsTrue(store.TryBuyOrEquip("cobalt", 5, true, out _));
            Assert.AreEqual(125, store.Load().DemoCoins);
            Assert.IsFalse(store.TryBuyOrEquip("coral", 5, false, out _));
            store.ClearSelection();
            Assert.AreEqual("", store.Load().SelectedTintId);
            Assert.AreEqual(125, store.Load().DemoCoins);
        }
        [Test]
        public void InsufficientFundsDoNotGrantTint_AndServerWalletFailsClosed()
        {
            Assert.IsFalse(store.TryBuyOrEquip("cobalt", 5, true, out string message));
            StringAssert.Contains("NOT ENOUGH", message);
            Assert.AreEqual(0, store.Load().OwnedTintIds.Length);
            Assert.ThrowsAsync<NotSupportedException>(async () =>
                await new UnavailableAccountEconomyGateway().LoadAsync());
        }
        [Test]
        public void CorruptOrForeignEntitlementsFailClosed()
        {
            PlayerPrefs.SetString(LocalPracticeStore.GuestKey, "{broken-json");
            Assert.AreEqual(0, store.Load().DemoCoins);
            var fake = new PracticeWallet { DemoCoins = 999999, SelectedTintId = "premium_glider",
                OwnedTintIds = new[] { "premium_glider", "cobalt" } };
            PlayerPrefs.SetString(LocalPracticeStore.GuestKey, JsonUtility.ToJson(fake));
            PracticeWallet safe = store.Load();
            Assert.AreEqual(LocalPracticeStore.ProvisionalWalletCap, safe.DemoCoins);
            Assert.AreEqual(1, safe.OwnedTintIds.Length);
            Assert.AreEqual("", safe.SelectedTintId);
        }
    }
}
