using System.Collections.Generic;
using System.IO;
using System.Reflection;
using NUnit.Framework;
using VELOX.Backend;
using VELOX.Core;

namespace VELOX.Tests
{
    /// <summary>
    /// Unity EditMode tests for VELOX's pure logic: identity constants,
    /// name sanitisation, leaderboard ordering/truncation/tie-breaking,
    /// month isolation and reset, and the secure RTDB JSON read path.
    ///
    /// Run via Unity → Window → General → Test Runner (EditMode).
    /// </summary>
    [TestFixture]
    public class VeloxLogicTests
    {
        private static string DataFile =>
            Path.Combine(Application.persistentDataPath, "velox_leaderboard.json");

        private static LocalLeaderboardService FreshService()
        {
            if (File.Exists(DataFile)) File.Delete(DataFile);
            return new LocalLeaderboardService();
        }

        [Test]
        public void Identity_IsVeloxAndNeo()
        {
            Assert.AreEqual("VELOX", GameIdentity.GameName);
            Assert.AreEqual("NEO", GameIdentity.PlayerName);
            Assert.AreEqual(10, GameIdentity.LeaderboardSize);
            Assert.AreEqual(3, GameIdentity.TopPodiumCount);
        }

        [Test]
        public void SanitiseName_Normalises()
        {
            Assert.AreEqual("NEO", LeaderboardEntry.SanitiseName(null));
            Assert.AreEqual("NEO", LeaderboardEntry.SanitiseName(""));
            Assert.AreEqual("HELLO.WORLD", LeaderboardEntry.SanitiseName("hello world"));
            Assert.AreEqual("AB", LeaderboardEntry.SanitiseName("a!@#b"));
            Assert.AreEqual(24, LeaderboardEntry.SanitiseName(new string('x', 30)).Length);
        }

        [Test]
        public void MonthKey_Format()
        {
            string key = LocalLeaderboardService.CurrentMonthKeyStatic();
            Assert.AreEqual(7, key.Length);
            Assert.AreEqual('-', key[4]);
        }

        [Test]
        public void Leaderboard_OrdersAndTruncates()
        {
            var svc = FreshService();
            for (int i = 0; i < 15; i++)
                svc.SubmitScoreAsync("P" + i, i * 10).GetAwaiter().GetResult();

            var top = svc.GetTopAsync(10).GetAwaiter().GetResult();
            Assert.AreEqual(10, top.Count);
            Assert.AreEqual(140, top[0].score);
            Assert.AreEqual(50, top[9].score);
            for (int i = 1; i < top.Count; i++)
                Assert.LessOrEqual(top[i].score, top[i - 1].score);
        }

        [Test]
        public void Leaderboard_DuplicateNameKeepsMax()
        {
            var svc = FreshService();
            svc.SubmitScoreAsync("Alice", 100).GetAwaiter().GetResult();
            svc.SubmitScoreAsync("Alice", 50).GetAwaiter().GetResult();
            var top = svc.GetTopAsync(10).GetAwaiter().GetResult();
            Assert.AreEqual(1, top.Count);
            Assert.AreEqual(100, top[0].score);
        }

        [Test]
        public void Leaderboard_TieBreakEarlierFirst()
        {
            var svc = FreshService();
            svc.SubmitScoreAsync("First", 100).GetAwaiter().GetResult();
            System.Threading.Thread.Sleep(20);
            svc.SubmitScoreAsync("Second", 100).GetAwaiter().GetResult();
            var top = svc.GetTopAsync(10).GetAwaiter().GetResult();
            Assert.AreEqual(2, top.Count);
            Assert.AreEqual("FIRST", top[0].name);
        }

        [Test]
        public void Leaderboard_MonthIsolation()
        {
            var svc = FreshService();
            svc.SubmitScoreAsync("Now", 50).GetAwaiter().GetResult();

            var field = typeof(LocalLeaderboardService).GetField("_months",
                BindingFlags.NonPublic | BindingFlags.Instance);
            var months = (Dictionary<string, List<LeaderboardEntry>>)field.GetValue(svc);
            months["2020-01"] = new List<LeaderboardEntry>
            {
                new LeaderboardEntry { id = "old", name = "OLD", score = 999999, month = "2020-01", timestamp = 1 }
            };

            var top = svc.GetTopAsync(10).GetAwaiter().GetResult();
            Assert.AreEqual(1, top.Count);
            Assert.AreEqual("NOW", top[0].name);
        }

        [Test]
        public void Leaderboard_ResetClearsMonth()
        {
            var svc = FreshService();
            svc.SubmitScoreAsync("Gone", 123).GetAwaiter().GetResult();
            Assert.AreEqual(1, svc.GetTopAsync(10).GetAwaiter().GetResult().Count);
            svc.ResetCurrentMonthAsync().GetAwaiter().GetResult();
            Assert.AreEqual(0, svc.GetTopAsync(10).GetAwaiter().GetResult().Count);
        }

        [Test]
        public void MiniJson_ParsesRtdbMonthNode()
        {
            string sample = "{\"u1\":{\"id\":\"u1\",\"name\":\"ALICE\",\"score\":100,\"month\":\"2026-10\",\"timestamp\":1}}";
            var entries = MiniJson.ToEntries(MiniJson.Parse(sample), "2026-10");
            Assert.AreEqual(1, entries.Count);
            Assert.AreEqual("ALICE", entries[0].name);
            Assert.AreEqual(100, entries[0].score);
        }
    }
}
