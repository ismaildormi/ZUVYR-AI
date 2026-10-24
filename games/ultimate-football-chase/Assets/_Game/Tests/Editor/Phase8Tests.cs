using System;
using System.Threading.Tasks;
using NUnit.Framework;
using UltimateFootballChase.Rankings;

namespace UltimateFootballChase.Tests
{
    public sealed class Phase8Tests
    {
        private static LeaderboardSnapshot Published(BoardKind kind) => new LeaderboardSnapshot
        {
            Channel = kind == BoardKind.Weekly ? "weekly" : kind == BoardKind.Monthly ? "monthly" : "hall",
            PeriodKey = kind == BoardKind.Weekly ? "2026-W43" : "2026-10",
            State = kind == BoardKind.Hall ? "archived" : "live",
            PublishedUtcTicks = new DateTime(2026, 10, 24, 0, 0, 0, DateTimeKind.Utc).Ticks,
            Entries = new[] {
                new RankedEntry { PublicId = "alias_001", Alias = "Comet", Rank = 1, Points = 900 },
                new RankedEntry { PublicId = "alias_002", Alias = "Falcon", Rank = 2, Points = 650 }
            }
        };

        [Test]
        public void FixedDocumentIds_NeverUsePlayerControlledPath()
        {
            Assert.AreEqual("weekly_current", LeaderboardPolicy.DocumentId(BoardKind.Weekly));
            Assert.AreEqual("monthly_current", LeaderboardPolicy.DocumentId(BoardKind.Monthly));
            Assert.AreEqual("hall_previous", LeaderboardPolicy.DocumentId(BoardKind.Hall));
            Assert.Throws<ArgumentOutOfRangeException>(() => LeaderboardPolicy.DocumentId((BoardKind)100));
        }
        [Test]
        public void OnlyExpectedServerSnapshotStructureRenders()
        {
            Assert.IsTrue(LeaderboardPolicy.IsValid(Published(BoardKind.Weekly), BoardKind.Weekly));
            Assert.IsTrue(LeaderboardPolicy.IsValid(Published(BoardKind.Monthly), BoardKind.Monthly));
            Assert.IsTrue(LeaderboardPolicy.IsValid(Published(BoardKind.Hall), BoardKind.Hall));
            Assert.IsFalse(LeaderboardPolicy.IsValid(Published(BoardKind.Weekly), BoardKind.Monthly));
            var empty = Published(BoardKind.Weekly);
            empty.Entries = Array.Empty<RankedEntry>();
            Assert.IsTrue(LeaderboardPolicy.IsValid(empty, BoardKind.Weekly)); // genuine published empty ≠ offline
            empty.Entries = null;
            Assert.IsFalse(LeaderboardPolicy.IsValid(empty, BoardKind.Weekly));
        }
        [Test]
        public void RejectsTamperedRankOrderScoreDuplicateIdAndMaliciousAliases()
        {
            var view = Published(BoardKind.Weekly);
            view.Entries[1].Rank = 3;
            Assert.IsFalse(LeaderboardPolicy.IsValid(view, BoardKind.Weekly));
            view = Published(BoardKind.Weekly);
            view.Entries[1].Points = 901;
            Assert.IsFalse(LeaderboardPolicy.IsValid(view, BoardKind.Weekly));
            view = Published(BoardKind.Weekly);
            view.Entries[1].PublicId = view.Entries[0].PublicId;
            Assert.IsFalse(LeaderboardPolicy.IsValid(view, BoardKind.Weekly));
            view = Published(BoardKind.Weekly);
            view.Entries[0].Alias = "<color=red>fake</color>";
            Assert.IsFalse(LeaderboardPolicy.IsValid(view, BoardKind.Weekly));
            view = Published(BoardKind.Weekly);
            view.Entries[0].Alias = "Name\nInjected row";
            Assert.IsFalse(LeaderboardPolicy.IsValid(view, BoardKind.Weekly));
            view = Published(BoardKind.Weekly);
            view.Entries[0].Points = long.MaxValue;
            Assert.IsFalse(LeaderboardPolicy.IsValid(view, BoardKind.Weekly));
        }
        [Test]
        public void RejectsInvalidPeriodsAndNeverInfersMonthlyPrizesFromWeeklyPoints()
        {
            var weekly = Published(BoardKind.Weekly);
            weekly.PeriodKey = "2026-10";
            Assert.IsFalse(LeaderboardPolicy.IsValid(weekly, BoardKind.Weekly));
            weekly.PeriodKey = "2026-W53"; // 2026 has only 52 ISO weeks
            Assert.IsFalse(LeaderboardPolicy.IsValid(weekly, BoardKind.Weekly));
            weekly.PeriodKey = "2020-W53"; // valid ISO leap-year boundary
            Assert.IsTrue(LeaderboardPolicy.IsValid(weekly, BoardKind.Weekly));
            var monthly = Published(BoardKind.Monthly);
            monthly.State = "winner";
            Assert.IsFalse(LeaderboardPolicy.IsValid(monthly, BoardKind.Monthly));
            monthly = Published(BoardKind.Monthly);
            monthly.PeriodKey = "2026-13";
            Assert.IsFalse(LeaderboardPolicy.IsValid(monthly, BoardKind.Monthly));
            monthly.PeriodKey = "0000-10";
            Assert.IsFalse(LeaderboardPolicy.IsValid(monthly, BoardKind.Monthly));
            var hall = Published(BoardKind.Hall);
            hall.State = "under_review";
            Assert.IsFalse(LeaderboardPolicy.IsValid(hall, BoardKind.Hall));
        }
        [Test]
        public async Task MissingServiceAndMissingDocumentNeverBecomeFakeScores()
        {
            var unavailable = await new LeaderboardService(new UnavailableLeaderboardGateway())
                .LoadAsync(BoardKind.Weekly);
            Assert.IsNull(unavailable.Snapshot);
            StringAssert.Contains("UNAVAILABLE", unavailable.Status);
            var missing = await new LeaderboardService(new FakeGateway(null)).LoadAsync(BoardKind.Weekly);
            Assert.IsNull(missing.Snapshot);
            var offline = await new LeaderboardService(new FakeGateway(null, true)).LoadAsync(BoardKind.Weekly);
            Assert.IsNull(offline.Snapshot);
            Assert.IsFalse(offline.Status.Contains("SERVER-PUBLISHED"));
        }
        [Test]
        public async Task HangingNetworkTimesOutWithoutShowingCachedOrLocalRows()
        {
            var hanging = new PendingGateway();
            BoardLoadResult result = await new LeaderboardService(hanging, 5).LoadAsync(BoardKind.Weekly);
            Assert.IsNull(result.Snapshot);
            StringAssert.Contains("timed out", result.Status);
        }
        [Test]
        public async Task ServiceCopiesValidatedRowsButCannotCertifyPrizes()
        {
            var source = Published(BoardKind.Weekly);
            BoardLoadResult result = await new LeaderboardService(new FakeGateway(source)).LoadAsync(BoardKind.Weekly);
            Assert.NotNull(result.Snapshot);
            Assert.AreNotSame(source, result.Snapshot);
            source.Entries[0].Points = 1;
            Assert.AreEqual(900, result.Snapshot.Entries[0].Points);
            StringAssert.Contains("not a prize decision", result.Status);
        }
        private sealed class PendingGateway : ILeaderboardGateway
        {
            private readonly TaskCompletionSource<LeaderboardSnapshot> pending =
                new TaskCompletionSource<LeaderboardSnapshot>();
            public bool IsConfigured => true;
            public Task<LeaderboardSnapshot> FetchServerPublishedAsync(BoardKind kind) => pending.Task;
        }
        private sealed class FakeGateway : ILeaderboardGateway
        {
            private readonly LeaderboardSnapshot value;
            private readonly bool fail;
            public FakeGateway(LeaderboardSnapshot snapshot, bool throwNetwork = false)
            { value = snapshot; fail = throwNetwork; }
            public bool IsConfigured => true;
            public Task<LeaderboardSnapshot> FetchServerPublishedAsync(BoardKind kind) => fail ?
                Task.FromException<LeaderboardSnapshot>(new InvalidOperationException("offline")) :
                Task.FromResult(value);
        }
    }
}
