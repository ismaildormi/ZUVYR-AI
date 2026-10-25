// ============================================================================
// VELOX offline logic tests. Runs against the real VELOX source files compiled
// with plain Roslyn (no Unity Editor). Covers leaderboard ordering, Top-10
// truncation, tie-breaking, month isolation/reset, name sanitisation and
// identity constants.
// ============================================================================
using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Threading;
using UnityEngine;
using VELOX.Backend;
using VELOX.Core;
using VELOX.Gameplay;
using VELOX.Visuals;

internal static class Program
{
    private static int _pass;
    private static int _fail;

    private static string _dataFile =>
        Path.Combine(Application.persistentDataPath, "velox_leaderboard.json");

    private static void Check(bool condition, string name)
    {
        if (condition) { _pass++; Console.WriteLine("  PASS  " + name); }
        else { _fail++; Console.WriteLine("  FAIL  " + name); }
    }

    private static void FreshService(out LocalLeaderboardService service)
    {
        if (File.Exists(_dataFile)) File.Delete(_dataFile);
        service = new LocalLeaderboardService();
    }

    private static void Main()
    {
        Directory.CreateDirectory(Application.persistentDataPath);

        Console.WriteLine("== Identity ==");
        Check(GameIdentity.GameName == "VELOX", "GameIdentity.GameName == VELOX");
        Check(GameIdentity.PlayerName == "NEO", "GameIdentity.PlayerName == NEO");
        Check(GameIdentity.LeaderboardSize == 10, "LeaderboardSize == 10");
        Check(GameIdentity.TopPodiumCount == 3, "TopPodiumCount == 3");
        Check(GameIdentity.LegacyGameName == "DashX", "LegacyGameName preserved for reference");

        Console.WriteLine("== SanitiseName ==");
        Check(LeaderboardEntry.SanitiseName(null) == "NEO", "null name -> NEO");
        Check(LeaderboardEntry.SanitiseName("") == "NEO", "empty name -> NEO");
        Check(LeaderboardEntry.SanitiseName("hello world") == "HELLO.WORLD", "spaces -> dots, uppercase");
        Check(LeaderboardEntry.SanitiseName("a!@#b") == "AB", "symbols stripped");
        Check(LeaderboardEntry.SanitiseName(new string('x', 30)).Length == 24, "name capped at 24");

        Console.WriteLine("== Month key ==");
        string month = LocalLeaderboardService.CurrentMonthKeyStatic();
        Check(month.Length == 7 && month[4] == '-', "month key format yyyy-MM");
        Check(int.Parse(month.Substring(5)) >= 1 && int.Parse(month.Substring(5)) <= 12, "month in 01..12");

        Console.WriteLine("== Ordering + Top-10 truncation ==");
        FreshService(out var svc);
        for (int i = 0; i < 15; i++)
            svc.SubmitScoreAsync("P" + i, i * 10).GetAwaiter().GetResult();

        var top = svc.GetTopAsync(10).GetAwaiter().GetResult();
        Check(top.Count == 10, "only 10 returned");
        Check(top[0].score == 140, "highest score first");
        Check(top[9].score == 50, "10th score correct");
        bool sorted = true;
        for (int i = 1; i < top.Count; i++) if (top[i].score > top[i - 1].score) sorted = false;
        Check(sorted, "descending order");

        Console.WriteLine("== Duplicate name keeps max ==");
        FreshService(out svc);
        svc.SubmitScoreAsync("Alice", 100).GetAwaiter().GetResult();
        svc.SubmitScoreAsync("Alice", 50).GetAwaiter().GetResult();
        top = svc.GetTopAsync(10).GetAwaiter().GetResult();
        Check(top.Count == 1, "duplicate name collapses to one entry");
        Check(top[0].score == 100, "max score retained");

        svc.SubmitScoreAsync("Alice", 200).GetAwaiter().GetResult();
        top = svc.GetTopAsync(10).GetAwaiter().GetResult();
        Check(top[0].score == 200, "higher score updates in place");

        Console.WriteLine("== Tie-breaking (earlier first) ==");
        FreshService(out svc);
        svc.SubmitScoreAsync("First", 100).GetAwaiter().GetResult();
        Thread.Sleep(10);
        svc.SubmitScoreAsync("Second", 100).GetAwaiter().GetResult();
        top = svc.GetTopAsync(10).GetAwaiter().GetResult();
        Check(top.Count == 2, "two equal-score entries present");
        Check(top[0].name == "FIRST", "earlier submission ranks first");

        Console.WriteLine("== Month isolation ==");
        FreshService(out svc);
        svc.SubmitScoreAsync("Now", 50).GetAwaiter().GetResult();
        // Inject a previous-month bucket directly to prove cross-month isolation.
        var field = typeof(LocalLeaderboardService).GetField("_months", BindingFlags.NonPublic | BindingFlags.Instance);
        var months = (Dictionary<string, List<LeaderboardEntry>>)field.GetValue(svc);
        months["2020-01"] = new List<LeaderboardEntry>
        {
            new LeaderboardEntry { id = "old", name = "OLD", score = 999999, month = "2020-01", timestamp = 1 }
        };
        top = svc.GetTopAsync(10).GetAwaiter().GetResult();
        Check(top.Count == 1, "previous-month entry excluded from Top-10");
        Check(top[0].name == "NOW", "only current-month entry returned");

        Console.WriteLine("== Monthly reset ==");
        FreshService(out svc);
        svc.SubmitScoreAsync("Gone", 123).GetAwaiter().GetResult();
        top = svc.GetTopAsync(10).GetAwaiter().GetResult();
        Check(top.Count == 1, "score present before reset");
        svc.ResetCurrentMonthAsync().GetAwaiter().GetResult();
        top = svc.GetTopAsync(10).GetAwaiter().GetResult();
        Check(top.Count == 0, "current month cleared by reset");

        Console.WriteLine("== PlayerProfile ==");
        var guest = new PlayerProfile { localId = "g1" };
        Check(guest.DisplayName == "NEO", "empty display name falls back to NEO");
        var named = new PlayerProfile { localId = "u1", displayName = "  " };
        Check(named.DisplayName == "NEO", "whitespace display name falls back to NEO");
        var real = new PlayerProfile { localId = "u2", displayName = "Cool Player" };
        Check(real.DisplayName == "Cool Player", "real display name preserved");
        Check(real.SafeDisplayName == "COOL.PLAYER", "safe name sanitized");
        Check(real.localId == "u2", "stable id independent of display name");

        Console.WriteLine("== MiniJson (secure RTDB read path) ==");
        string sample = "{\"uid1\":{\"id\":\"uid1\",\"name\":\"ALICE\",\"score\":100,\"month\":\"2026-10\",\"timestamp\":1},\"uid2\":{\"id\":\"uid2\",\"name\":\"BOB\",\"score\":50,\"month\":\"2026-10\",\"timestamp\":2}}";
        var entries = MiniJson.ToEntries(MiniJson.Parse(sample), "2026-10");
        Check(entries.Count == 2, "MiniJson parses uid-keyed month map");
        var alice = entries.Find(e => e.name == "ALICE");
        Check(alice != null && alice.score == 100, "MiniJson extracts entry fields");
        Check(MiniJson.ToEntries(null, "2026-10").Count == 0, "MiniJson handles null node");

        Console.WriteLine("== ProceduralVisuals obstacle geometry ==");
        float jumpY = ProceduralVisuals.ObstacleCenterY(Obstacle.Kind.Jumpable);
        float slideY = ProceduralVisuals.ObstacleCenterY(Obstacle.Kind.Slideable);
        float blockY = ProceduralVisuals.ObstacleCenterY(Obstacle.Kind.Block);
        Check(jumpY < slideY, "jumpable obstacle sits below the slide bar");
        Check(ProceduralVisuals.ObstacleHalfSize(Obstacle.Kind.Block).y >
              ProceduralVisuals.ObstacleHalfSize(Obstacle.Kind.Jumpable).y,
              "block is taller than jumpable");
        Check(ProceduralVisuals.ObstacleHalfSize(Obstacle.Kind.Slideable).y < 0.3f,
              "slideable is a thin bar (slide-under)");
        float blockTop = blockY + ProceduralVisuals.ObstacleHalfSize(Obstacle.Kind.Block).y;
        float slideTop = slideY + ProceduralVisuals.ObstacleHalfSize(Obstacle.Kind.Slideable).y;
        Check(blockTop > slideTop, "block is the tallest obstacle");

        Console.WriteLine();
        Console.WriteLine("RESULT: " + _pass + " passed, " + _fail + " failed");
        Environment.Exit(_fail == 0 ? 0 : 1);
    }
}
