using System;
using System.Security.Cryptography;
using System.Text;
using NUnit.Framework;
using UnityEngine;
using UltimateFootballChase.Backend;
using UltimateFootballChase.Hub;

namespace UltimateFootballChase.Tests
{
    public sealed class Phase5Tests
    {
        [Test]
        public void SameUidOfflineMergeKeepsMaxProgressButNewestLocation()
        {
            var remote = new HubProgress { CompletedStages = 7, FinishedRuns = 10,
                BestRunMeters = 700, Position = new Vector3(1, 0, 2), LastSavedUtcTicks = 100 };
            var local = new HubProgress { CompletedStages = 5, FinishedRuns = 12,
                BestRunMeters = 1200, Position = new Vector3(3, 0, 4), LastSavedUtcTicks = 200,
                SelectedOutfit = "amber" };
            HubProgress merged = AccountHubPolicy.Merge(remote, local);
            Assert.AreEqual(7, merged.CompletedStages);
            Assert.AreEqual(12, merged.FinishedRuns); // never sum replayed sessions
            Assert.AreEqual(1200, merged.BestRunMeters);
            Assert.AreEqual(local.Position, merged.Position);
            Assert.AreEqual("amber", merged.SelectedOutfit);
            Assert.AreEqual(7, remote.CompletedStages); // no mutation of remote or cached input
            Assert.AreEqual(5, local.CompletedStages);
        }
        [Test]
        public void AccountCacheSeparatedByVerifiedUidAndNeverWritesToGuest()
        {
            string firstUid = "phase5-tests-first", secondUid = "phase5-tests-second";
            string[] keys = { Key(firstUid), Key(secondUid) };
            string guestBefore = PlayerPrefs.GetString("ufc.hub.guest.v1", "");
            try
            {
                foreach (string key in keys) PlayerPrefs.DeleteKey(key);
                var first = new AccountLocalStorage(firstUid);
                var second = new AccountLocalStorage(secondUid);
                Assert.IsNull(first.Load());
                Assert.IsNull(second.Load());
                var value = new HubProgress { CompletedStages = 3, SelectedOutfit = "violet" };
                first.Save(value);
                Assert.Greater(value.LastSavedUtcTicks, 0);
                Assert.AreEqual(3, first.Load().CompletedStages);
                Assert.IsNull(second.Load());
                Assert.AreEqual(guestBefore, PlayerPrefs.GetString("ufc.hub.guest.v1", ""));
            }
            finally { foreach (string key in keys) PlayerPrefs.DeleteKey(key); }
        }
        [Test]
        public void AccountBoundRepositoryQueuesOnlyAccountSnapshot()
        {
            string uid = "phase5-tests-queue";
            try
            {
                var cache = new AccountLocalStorage(uid);
                HubProgress queued = null;
                var repository = new AccountBoundHubRepository(cache, profile => queued = profile);
                repository.Save(new HubProgress { CompletedStages = 4 });
                Assert.NotNull(queued);
                Assert.AreEqual(4, queued.CompletedStages);
                Assert.AreEqual(4, repository.Load().CompletedStages);
                Assert.Greater(queued.LastSavedUtcTicks, 0);
            }
            finally { PlayerPrefs.DeleteKey(Key(uid)); }
        }
        [Test]
        public void CorruptAccountProfileDoesNotBecomeProgress()
        {
            string uid = "phase5-tests-corrupt";
            try
            {
                PlayerPrefs.SetString(Key(uid), "{not-json");
                Assert.IsNull(new AccountLocalStorage(uid).Load());
                PlayerPrefs.SetString(Key(uid), "{\"SchemaVersion\":999,\"CompletedStages\":1000}");
                Assert.IsNull(new AccountLocalStorage(uid).Load());
                var invalid = new HubProgress { CompletedStages = int.MaxValue,
                    BestRunMeters = float.PositiveInfinity, SelectedOutfit = "unowned" };
                HubProgress clean = HubProgressSanitizer.Clean(invalid);
                Assert.AreEqual(1000, clean.CompletedStages);
                Assert.AreEqual(0, clean.BestRunMeters);
                Assert.AreEqual("teal", clean.SelectedOutfit);
            }
            finally { PlayerPrefs.DeleteKey(Key(uid)); }
        }
        [Test]
        public void GuestReservationCannotBeReusedByAnotherNewAccount()
        {
            const string claimed = "ufc.hub.guest.claimed.v1";
            const string pending = "ufc.hub.guest.claim.pending.v1";
            bool hadClaim = PlayerPrefs.HasKey(claimed), hadPending = PlayerPrefs.HasKey(pending);
            string oldClaim = PlayerPrefs.GetString(claimed), oldPending = PlayerPrefs.GetString(pending);
            try
            {
                PlayerPrefs.DeleteKey(claimed);
                PlayerPrefs.DeleteKey(pending);
                Assert.IsTrue(GuestClaimMarker.CanClaim("A"));
                GuestClaimMarker.Reserve("A");
                Assert.IsTrue(GuestClaimMarker.ReservedFor("A"));
                Assert.IsFalse(GuestClaimMarker.CanClaim("B"));
                GuestClaimMarker.MarkClaimed("A");
                Assert.IsTrue(GuestClaimMarker.WasClaimed);
                Assert.IsFalse(GuestClaimMarker.CanClaim("A"));
                Assert.IsFalse(GuestClaimMarker.CanClaim("B"));
            }
            finally
            {
                if (hadClaim) PlayerPrefs.SetString(claimed, oldClaim); else PlayerPrefs.DeleteKey(claimed);
                if (hadPending) PlayerPrefs.SetString(pending, oldPending); else PlayerPrefs.DeleteKey(pending);
            }
        }
        [Test]
        public void UnconfiguredBuildDoesNotPretendToAuthenticate()
        {
#if !UFC_FIREBASE
            IAccountAuthGateway auth = BackendFactory.Auth();
            Assert.IsFalse(auth.IsConfigured);
            Assert.ThrowsAsync<InvalidOperationException>(async () => await auth.GoogleAsync());
            Assert.ThrowsAsync<InvalidOperationException>(async () => await BackendFactory.Cloud().FetchAsync("uid"));
#endif
        }
        private static string Key(string uid)
        {
            using (var sha = SHA256.Create())
                return "ufc.hub.account.v1." + BitConverter.ToString(
                    sha.ComputeHash(Encoding.UTF8.GetBytes(uid))).Replace("-", "").ToLowerInvariant();
        }
    }
}
