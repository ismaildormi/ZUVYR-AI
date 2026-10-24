using System;
using NUnit.Framework;
using UnityEngine;
using UltimateFootballChase.Ads;
using UltimateFootballChase.Economy;

namespace UltimateFootballChase.Tests
{
    public sealed class Phase7Tests
    {
        private bool hadWallet;
        private string beforeWallet;
        private LocalPracticeStore store;
        [SetUp]
        public void Setup()
        {
            hadWallet = PlayerPrefs.HasKey(LocalPracticeStore.GuestKey);
            beforeWallet = PlayerPrefs.GetString(LocalPracticeStore.GuestKey, "");
            PlayerPrefs.DeleteKey(LocalPracticeStore.GuestKey);
            store = new LocalPracticeStore();
        }
        [TearDown]
        public void Cleanup()
        {
            if (hadWallet) PlayerPrefs.SetString(LocalPracticeStore.GuestKey, beforeWallet);
            else PlayerPrefs.DeleteKey(LocalPracticeStore.GuestKey);
        }
        [Test]
        public void ExactEightWheelWeightsAndBoundaries()
        {
            CollectionAssert.AreEqual(new[] { 25, 20, 20, 15, 10, 5, 3, 2 }, WheelDefinition.Weights);
            int[] counts = new int[8];
            for (int roll = 0; roll < 100; roll++) counts[(int)WheelDefinition.ResultForRoll(roll)]++;
            CollectionAssert.AreEqual(WheelDefinition.Weights, counts);
            Assert.AreEqual(WheelPrize.Coin50, WheelDefinition.ResultForRoll(24));
            Assert.AreEqual(WheelPrize.Coin100, WheelDefinition.ResultForRoll(25));
            Assert.AreEqual(WheelPrize.Key1, WheelDefinition.ResultForRoll(45));
            Assert.AreEqual(WheelPrize.Gem5, WheelDefinition.ResultForRoll(99));
            Assert.Throws<ArgumentOutOfRangeException>(() => WheelDefinition.ResultForRoll(100));
            Assert.Throws<ArgumentOutOfRangeException>(() => WheelDefinition.ResultForRoll(-1));
        }
        [Test]
        public void DemoSpinOncePerUtcDay_ClockRollbackBlocked_NoAccountSpin()
        {
            DateTime day = new DateTime(2026, 10, 24, 0, 0, 0, DateTimeKind.Utc);
            Assert.IsFalse(store.TryFreeWheelSpin(day, false, 0, out _, out _));
            Assert.IsFalse(store.TryFreeWheelSpin(day, true, -1, out _, out _));
            Assert.AreEqual(0, store.Load().DemoCoins);
            Assert.IsTrue(store.TryFreeWheelSpin(day, true, 0, out WheelPrize prize, out _));
            Assert.AreEqual(WheelPrize.Coin50, prize);
            Assert.AreEqual(50, store.Load().DemoCoins);
            string guestSnapshot = PlayerPrefs.GetString(LocalPracticeStore.GuestKey);
            Assert.IsFalse(store.TryFreeWheelSpin(day.AddHours(1), false, 98, out _, out _));
            Assert.AreEqual(guestSnapshot, PlayerPrefs.GetString(LocalPracticeStore.GuestKey));
            Assert.IsFalse(store.TryFreeWheelSpin(day.AddHours(22), true, 25, out _, out _));
            Assert.IsFalse(store.TryFreeWheelSpin(day.AddDays(-1), true, 25, out _, out _));
            Assert.AreEqual(50, store.Load().DemoCoins);
            Assert.IsTrue(store.TryFreeWheelSpin(day.AddDays(1), true, 25, out _, out _));
            Assert.AreEqual(150, store.Load().DemoCoins);
            Assert.AreEqual(20261025L, store.Load().LastFreeSpinUtcDay);
        }
        [Test]
        public void AllEightDemoSlotsApplyOnlyToGuestPracticeSnapshot()
        {
            int[] starts = { 0, 25, 45, 65, 80, 90, 95, 98 };
            DateTime firstDay = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
            for (int i = 0; i < starts.Length; i++)
                Assert.IsTrue(store.TryFreeWheelSpin(firstDay.AddDays(i), true, starts[i], out _, out _));
            PracticeWallet wallet = store.Load();
            Assert.AreEqual(350, wallet.DemoCoins); // 50 + 100 + 200
            Assert.AreEqual(14, wallet.SimulatedKeys); // NOT runner revival keys
            Assert.AreEqual(1, wallet.SimulatedBoxes); // NOT openable inventory
            Assert.AreEqual(5, wallet.SimulatedGems); // NOT premium currency
            Assert.AreEqual((int)WheelPrize.Gem5, wallet.LastWheelSlot);
        }
        [Test]
        public void CorruptDemoWheelCountersCannotBecomeSpendingAuthority()
        {
            PlayerPrefs.SetString(LocalPracticeStore.GuestKey, JsonUtility.ToJson(new PracticeWallet
            {
                SimulatedKeys = int.MaxValue, SimulatedGems = int.MaxValue,
                SimulatedBoxes = -1, LastWheelSlot = 900, LastFreeSpinUtcDay = -3
            }));
            PracticeWallet value = store.Load();
            Assert.AreEqual(10000, value.SimulatedKeys);
            Assert.AreEqual(10000, value.SimulatedGems);
            Assert.AreEqual(0, value.SimulatedBoxes);
            Assert.AreEqual(-1, value.LastWheelSlot);
            Assert.AreEqual(0, value.LastFreeSpinUtcDay);
            Assert.AreEqual(0, value.DemoCoins); // wheel-only simulated gems/keys cannot buy tints
            Assert.IsFalse(store.TryBuyOrEquip("premium_glider", 5, true, out _));
        }
        [Test]
        public void InterstitialOnlyAfterFourthFinishedAttempt_AndOnlyBetweenRuns()
        {
            var policy = new InterstitialPacer();
            for (int i = 0; i < 3; i++)
            {
                policy.OnCompletedAttempt();
                Assert.IsFalse(policy.CanShow(true, false, true, false));
            }
            policy.OnCompletedAttempt();
            Assert.IsFalse(policy.CanShow(false, false, true, false)); // never during play/VAR
            Assert.IsFalse(policy.CanShow(true, true, true, false)); // verified remove-ads entitlement
            Assert.IsFalse(policy.CanShow(true, false, false, false)); // no SDK
            Assert.IsFalse(policy.CanShow(true, false, true, true)); // rewarded ad in progress
            Assert.IsTrue(policy.CanShow(true, false, true, false));
            policy.OnActuallyShown(false);
            Assert.IsTrue(policy.CanShow(true, false, true, false));
            policy.OnActuallyShown(true);
            Assert.IsFalse(policy.CanShow(true, false, true, false));
        }
        [Test]
        public void RewardedAdsFailClosed_StreakOnlyInformationalUntilServerValidation()
        {
            Assert.IsFalse(new UnavailableAdGateway().IsConfigured);
            Assert.ThrowsAsync<NotSupportedException>(async () =>
                await new UnavailableAdGateway().ShowRewardedAsync(RewardedPlacement.ExtraWheelSpin));
            Assert.ThrowsAsync<NotSupportedException>(async () =>
                await new UnavailableRewardVerificationGateway().ConfirmRewardAsync(
                    RewardedPlacement.StoreCoins, "unverified"));
            Assert.IsFalse(RewardedStreakPolicy.WouldAwardBonus(4));
            Assert.IsTrue(RewardedStreakPolicy.WouldAwardBonus(5));
            Assert.IsTrue(RewardedStreakPolicy.WouldAwardBonus(10));
            Assert.AreEqual(50, RewardedStreakPolicy.CoinsPerBonus);
            Assert.AreEqual(0, store.Load().DemoCoins); // testing math never grants currency
        }
    }
}
