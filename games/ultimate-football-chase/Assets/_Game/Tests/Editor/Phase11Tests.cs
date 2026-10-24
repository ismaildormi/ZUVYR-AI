using System;
using NUnit.Framework;
using UnityEngine;
using UltimateFootballChase.Characters;
using UltimateFootballChase.Economy;
using UltimateFootballChase.Hub;

namespace UltimateFootballChase.Tests
{
    public sealed class Phase11Tests
    {
        private string original;
        private bool existed;
        private LocalPracticeStore store;
        [SetUp]
        public void Setup()
        {
            existed = PlayerPrefs.HasKey(LocalPracticeStore.GuestKey);
            original = PlayerPrefs.GetString(LocalPracticeStore.GuestKey, "");
            PlayerPrefs.DeleteKey(LocalPracticeStore.GuestKey);
            store = new LocalPracticeStore();
        }
        [TearDown]
        public void Cleanup()
        {
            if (existed) PlayerPrefs.SetString(LocalPracticeStore.GuestKey, original);
            else PlayerPrefs.DeleteKey(LocalPracticeStore.GuestKey);
        }
        [Test]
        public void V2OriginalRosterAndKitsAreDistinctAndBounded()
        {
            Assert.AreEqual(8, OriginalRoster.Ids.Length);
            Assert.AreEqual(8, OriginalRoster.KitIds.Length);
            Assert.AreEqual(8, OriginalRoster.Names.Length);
            foreach (string character in OriginalRoster.Ids) Assert.IsTrue(OriginalRoster.Contains(character));
            Assert.IsFalse(OriginalRoster.CanSelectKit("rose", 24));
            Assert.IsTrue(OriginalRoster.CanSelectKit("rose", 25));
            var forged = new HubProgress { SelectedOutfit = "rose", CompletedStages = 0, SelectedCharacter = "unknown" };
            HubProgressSanitizer.Clean(forged);
            Assert.AreEqual("teal", forged.SelectedOutfit);
            Assert.AreEqual("kivo", forged.SelectedCharacter);
        }
        [Test]
        public void DemoPackAtomicallyGrantsContentsAndDoesNotChargeTwice()
        {
            Assert.IsTrue(store.CreditRun(Guid.NewGuid().ToString(), 200, true));
            Assert.IsTrue(store.CreditRun(Guid.NewGuid().ToString(), 100, true));
            Assert.IsFalse(store.TryBuyOrEquip("pack_city_glow", 4, true, out _));
            Assert.IsFalse(store.TryBuyOrEquip("pack_city_glow", 5, false, out _));
            Assert.AreEqual(300, store.Load().DemoCoins);
            Assert.IsTrue(store.TryBuyOrEquip("pack_city_glow", 5, true, out _));
            PracticeWallet wallet = store.Load();
            Assert.AreEqual(50, wallet.DemoCoins);
            CollectionAssert.Contains(wallet.OwnedTintIds, "cobalt");
            CollectionAssert.Contains(wallet.OwnedTintIds, "coral");
            CollectionAssert.Contains(wallet.OwnedBoardIds, "comet_board");
            CollectionAssert.Contains(wallet.OwnedPackIds, "pack_city_glow");
            Assert.AreEqual("comet_board", wallet.SelectedBoardId);
            Assert.IsTrue(store.TryBuyOrEquip("pack_city_glow", 5, true, out _));
            Assert.AreEqual(50, store.Load().DemoCoins);
        }
        [Test]
        public void PremiumPreviewAndForeignBoardSelectionsFailClosed()
        {
            var forged = new PracticeWallet { DemoCoins = 1000, SelectedBoardId = "premium_celestial_board",
                OwnedBoardIds = new[] { "premium_celestial_board", "comet_board" },
                OwnedPackIds = new[] { "premium_festival", "pack_city_glow" } };
            PlayerPrefs.SetString(LocalPracticeStore.GuestKey, JsonUtility.ToJson(forged));
            var safe = store.Load();
            Assert.AreEqual("", safe.SelectedBoardId);
            Assert.AreEqual(1, safe.OwnedBoardIds.Length);
            Assert.AreEqual(1, safe.OwnedPackIds.Length);
            Assert.IsFalse(store.TryBuyOrEquip("premium_festival", 5, true, out _));
            Assert.AreEqual(1000, store.Load().DemoCoins);
        }
        [Test]
        public void DemoCatalogKeepsProposedSixtyFortyPreviewBoundary()
        {
            int ordinary = 0, premium = 0, packs = 0;
            foreach (StoreItem item in StoreCatalog.Items)
            {
                if (item.Currency == StoreCurrency.Coins) ordinary++;
                else { premium++; Assert.AreEqual(StoreAvailability.PreviewOnly, item.Availability); }
                if (item.Availability != StoreAvailability.GuestDemoPack) continue;
                packs++;
                foreach (string part in item.Contents)
                    Assert.IsTrue(StoreCatalog.IsDemoTint(part) || StoreCatalog.IsDemoBoard(part));
            }
            Assert.AreEqual(12, ordinary);
            Assert.AreEqual(8, premium);
            Assert.AreEqual(3, packs);
        }
    }
}
