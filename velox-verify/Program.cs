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

        // The server-side closure marker (_closed) must never be treated as a leaderboard entry.
        string closedNode = @"{""uid1"":{""id"":""uid1"",""name"":""ALICE"",""score"":100,""month"":""2026-10"",""timestamp"":1},""_closed"":true}";
        var closedEntries = MiniJson.ToEntries(MiniJson.Parse(closedNode), "2026-10");
        Check(closedEntries.Count == 1, "MiniJson skips server-internal _closed marker");
        Check(closedEntries[0].name == "ALICE", "MiniJson keeps real entry alongside marker");

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

        Console.WriteLine("== CompetitionPeriod (month/year boundaries) ==");
        Check(CompetitionPeriod.IsValidKey("2026-10"), "valid key 2026-10");
        Check(!CompetitionPeriod.IsValidKey("2026-13"), "invalid month 13 rejected");
        Check(!CompetitionPeriod.IsValidKey("2026-00"), "invalid month 00 rejected");
        Check(!CompetitionPeriod.IsValidKey("bad"), "malformed key rejected");
        Check(CompetitionPeriod.PreviousKey("2026-01") == "2025-12", "Jan -> previous Dec (year boundary)");
        Check(CompetitionPeriod.PreviousKey("2026-12") == "2026-11", "Dec -> Nov");
        Check(CompetitionPeriod.PreviousKey("2020-01") == "2019-12", "year rollover 2020->2019");
        Check(CompetitionPeriod.Timezone == "UTC", "single documented timezone UTC");

        Console.WriteLine("== CompetitionRules (score validation) ==");
        Check(CompetitionRules.IsValidScore(0), "score 0 valid");
        Check(CompetitionRules.IsValidScore(1000000), "large score valid");
        Check(!CompetitionRules.IsValidScore(-1), "negative score rejected");
        Check(!CompetitionRules.IsValidScore(CompetitionRules.MaxScore + 1), "overflow score rejected");
        Check(CompetitionRules.IsValidSubmission(100, "NEO", false), "valid submission accepted");
        Check(!CompetitionRules.IsValidSubmission(100, "NEO", true), "finalized period rejects write");

        Console.WriteLine("== AuthTokens expiry ==");
        long nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var fresh = new AuthTokens { expiresAt = nowMs + 120000L };
        Check(!fresh.IsExpired(nowMs), "future token not expired");
        var old = new AuthTokens { expiresAt = nowMs - 1000L };
        Check(old.IsExpired(nowMs), "past token expired");
        var unknown = new AuthTokens { expiresAt = 0L };
        Check(!unknown.IsExpired(nowMs), "unknown-expiry token not expired");

        Console.WriteLine("== Validation rejection ==");
        FreshService(out svc);
        Check(!svc.SubmitScoreAsync("X", -5).GetAwaiter().GetResult(), "negative score rejected");
        Check(svc.SubmitScoreAsync("", 100).GetAwaiter().GetResult(), "empty name falls back to NEO (accepted)");
        top = svc.GetTopAsync(10).GetAwaiter().GetResult();
        Check(top.Count == 1 && top[0].name == "NEO" && top[0].score == 100, "empty-name score stored as NEO");

        Console.WriteLine("== Finalize + frozen + idempotent ==");
        FreshService(out svc);
        for (int i = 0; i < 12; i++)
            svc.SubmitScoreAsync("F" + i, (i + 1) * 100).GetAwaiter().GetResult();
        Check(!svc.IsFinalizedAsync(svc.CurrentMonthKey).GetAwaiter().GetResult(), "not finalized before");
        Check(svc.FinalizeMonthAsync(svc.CurrentMonthKey).GetAwaiter().GetResult(), "finalize succeeds");
        Check(svc.IsFinalizedAsync(svc.CurrentMonthKey).GetAwaiter().GetResult(), "finalized after");
        var final = svc.GetFinalizedAsync(svc.CurrentMonthKey, 10).GetAwaiter().GetResult();
        Check(final.Count == 10, "finalized snapshot holds Top-10");
        Check(final[0].score == 1200, "finalized #1 is highest score");
        Check(!svc.SubmitScoreAsync("Late", 9999).GetAwaiter().GetResult(), "write to finalized period rejected");
        Check(svc.FinalizeMonthAsync(svc.CurrentMonthKey).GetAwaiter().GetResult(), "re-finalize idempotent (true)");
        var final2 = svc.GetFinalizedAsync(svc.CurrentMonthKey, 10).GetAwaiter().GetResult();
        Check(final2.Count == 10 && final2[0].score == 1200, "snapshot unchanged after re-finalize");

        Console.WriteLine("== Historical preservation ==");
        FreshService(out svc);
        var monthsField = typeof(LocalLeaderboardService).GetField("_months", BindingFlags.NonPublic | BindingFlags.Instance);
        var histMonths = (Dictionary<string, List<LeaderboardEntry>>)monthsField.GetValue(svc);
        histMonths["2020-01"] = new List<LeaderboardEntry>
        {
            new LeaderboardEntry { id = "h1", name = "HIST", score = 9999, month = "2020-01", timestamp = 1 },
            new LeaderboardEntry { id = "h2", name = "HIST2", score = 1, month = "2020-01", timestamp = 2 }
        };
        Check(svc.FinalizeMonthAsync("2020-01").GetAwaiter().GetResult(), "finalize historical month");
        var hist = svc.GetFinalizedAsync("2020-01", 10).GetAwaiter().GetResult();
        Check(hist.Count == 2 && hist[0].score == 9999, "historical snapshot preserved & ranked");
        Check(!svc.IsFinalizedAsync(svc.CurrentMonthKey).GetAwaiter().GetResult(), "current month not finalized by historical finalize");
        svc.ResetCurrentMonthAsync().GetAwaiter().GetResult();
        var histAfter = svc.GetFinalizedAsync("2020-01", 10).GetAwaiter().GetResult();
        Check(histAfter.Count == 2, "reset clears current month but preserves finalized history");

        Console.WriteLine("== MiniJson array (finalized snapshot) ==");
        string snap = "{\"month\":\"2026-09\",\"entries\":[{\"id\":\"u1\",\"name\":\"ALICE\",\"score\":300,\"month\":\"2026-09\",\"timestamp\":5},{\"id\":\"u2\",\"name\":\"BOB\",\"score\":200,\"month\":\"2026-09\",\"timestamp\":6}]}";
        var root = MiniJson.Parse(snap) as System.Collections.Generic.Dictionary<string, object>;
        object entriesNode = root != null && root.TryGetValue("entries", out var en) ? en : null;
        var arr = MiniJson.ToEntryArray(entriesNode);
        Check(arr.Count == 2, "MiniJson parses finalized array");
        Check(arr[0].score == 300 && arr[0].name == "ALICE", "array entry fields extracted in order");

        Console.WriteLine("== Name sanitisation (unicode) ==");
        Check(LeaderboardEntry.SanitiseName("café") == "CAFÉ", "accented letters preserved");
        Check(LeaderboardEntry.SanitiseName("Héllo Wörld") == "HÉLLO.WÖRLD", "accented + space -> dot");
        Check(LeaderboardEntry.SanitiseName("   ") == "NEO", "all-spaces -> NEO");

        Console.WriteLine("== Best-score preservation (no rewrite on lower) ==");
        FreshService(out svc);
        svc.SubmitScoreAsync("Bob", 100).GetAwaiter().GetResult();
        var before = svc.GetTopAsync(10).GetAwaiter().GetResult()[0];
        Thread.Sleep(10);
        Check(svc.SubmitScoreAsync("Bob", 50).GetAwaiter().GetResult(), "lower-score replay accepted as ok");
        var after = svc.GetTopAsync(10).GetAwaiter().GetResult()[0];
        Check(after.score == 100, "lower score does not downgrade the best");
        Check(after.timestamp == before.timestamp, "no rewrite preserves original timestamp");
        Check(after.id == before.id, "no rewrite preserves original id");

        Console.WriteLine("== Credential storage (secure refresh-token persistence) ==");
        // 1. Secure available: refresh token stored in store, NOT in PlayerPrefs.
        {
            PlayerPrefs.Clear();
            var store = new MemoryCredentialStore { IsSecureStorageAvailable = true };
            var cp = new CredentialPersistence(store);
            bool ok = cp.StoreRefreshTokenAsync("rt-123").GetAwaiter().GetResult();
            Check(ok, "store refresh token in secure store succeeds");
            Check(store.Data.TryGetValue("refreshToken", out var v1) && v1 == "rt-123",
                "refresh token persisted in secure store");
            Check(PlayerPrefs.GetString("VELOX.Account.RefreshToken", "__NONE__") == "__NONE__",
                "refresh token NOT written to plaintext PlayerPrefs");
        }
        // 2. Secure unavailable: blocked, no plaintext fallback.
        {
            PlayerPrefs.Clear();
            var store = new MemoryCredentialStore { IsSecureStorageAvailable = false };
            var cp = new CredentialPersistence(store);
            bool ok = cp.StoreRefreshTokenAsync("rt-123").GetAwaiter().GetResult();
            Check(!ok, "store blocked when secure storage unavailable");
            Check(PlayerPrefs.GetString("VELOX.Account.RefreshToken", "__NONE__") == "__NONE__",
                "no plaintext fallback when secure storage unavailable");
        }
        // 3. Secure write fails: blocked, no plaintext fallback.
        {
            PlayerPrefs.Clear();
            var store = new MemoryCredentialStore { IsSecureStorageAvailable = true, FailNextStore = true };
            var cp = new CredentialPersistence(store);
            bool ok = cp.StoreRefreshTokenAsync("rt-123").GetAwaiter().GetResult();
            Check(!ok, "store blocked when secure store write fails");
            Check(PlayerPrefs.GetString("VELOX.Account.RefreshToken", "__NONE__") == "__NONE__",
                "no plaintext fallback when secure store write fails");
        }
        // 4. Load from secure store.
        {
            PlayerPrefs.Clear();
            var store = new MemoryCredentialStore { IsSecureStorageAvailable = true };
            store.Data["refreshToken"] = "rt-secure";
            var cp = new CredentialPersistence(store);
            string loaded = cp.LoadRefreshTokenAsync().GetAwaiter().GetResult();
            Check(loaded == "rt-secure", "load refresh token from secure store");
        }
        // 5. Load when nothing stored.
        {
            PlayerPrefs.Clear();
            var store = new MemoryCredentialStore { IsSecureStorageAvailable = true };
            var cp = new CredentialPersistence(store);
            string loaded = cp.LoadRefreshTokenAsync().GetAwaiter().GetResult();
            Check(loaded == null, "load returns null when nothing stored");
        }
        // 6. Migration: legacy plaintext -> secure store, plaintext deleted.
        {
            PlayerPrefs.Clear();
            PlayerPrefs.SetString("VELOX.Account.RefreshToken", "rt-legacy");
            var store = new MemoryCredentialStore { IsSecureStorageAvailable = true };
            var cp = new CredentialPersistence(store);
            string loaded = cp.LoadRefreshTokenAsync().GetAwaiter().GetResult();
            Check(loaded == "rt-legacy", "migration returns the legacy token");
            Check(store.Data.TryGetValue("refreshToken", out var v6) && v6 == "rt-legacy",
                "migration stores token in secure store");
            Check(PlayerPrefs.GetString("VELOX.Account.RefreshToken", "__NONE__") == "__NONE__",
                "migration deletes the plaintext PlayerPrefs key");
        }
        // 7. Migration failure (secure write fails): plaintext retained, null returned.
        {
            PlayerPrefs.Clear();
            PlayerPrefs.SetString("VELOX.Account.RefreshToken", "rt-legacy");
            var store = new MemoryCredentialStore { IsSecureStorageAvailable = true, FailNextStore = true };
            var cp = new CredentialPersistence(store);
            string loaded = cp.LoadRefreshTokenAsync().GetAwaiter().GetResult();
            Check(loaded == null, "migration failure returns null (success not claimed)");
            Check(PlayerPrefs.GetString("VELOX.Account.RefreshToken", "__NONE__") == "rt-legacy",
                "migration failure retains the plaintext key");
        }
        // 8. Migration blocked (secure unavailable): plaintext NOT used, retained.
        {
            PlayerPrefs.Clear();
            PlayerPrefs.SetString("VELOX.Account.RefreshToken", "rt-legacy");
            var store = new MemoryCredentialStore { IsSecureStorageAvailable = false };
            var cp = new CredentialPersistence(store);
            string loaded = cp.LoadRefreshTokenAsync().GetAwaiter().GetResult();
            Check(loaded == null, "legacy token blocked when secure storage unavailable");
            Check(PlayerPrefs.GetString("VELOX.Account.RefreshToken", "__NONE__") == "rt-legacy",
                "blocked legacy token is retained (not silently used or deleted)");
        }
        // 9. Sign-out: clear removes from secure store + deletes plaintext.
        {
            PlayerPrefs.Clear();
            var store = new MemoryCredentialStore { IsSecureStorageAvailable = true };
            store.Data["refreshToken"] = "rt-123";
            PlayerPrefs.SetString("VELOX.Account.RefreshToken", "rt-old");
            var cp = new CredentialPersistence(store);
            cp.ClearRefreshTokenAsync().GetAwaiter().GetResult();
            Check(!store.Data.ContainsKey("refreshToken"), "sign-out removes refresh token from secure store");
            Check(PlayerPrefs.GetString("VELOX.Account.RefreshToken", "__NONE__") == "__NONE__",
                "sign-out deletes the legacy plaintext refresh token");
        }
        // 10. AccountSession wiring: ApplyTokensAsync stores the refresh token in
        // secure storage (not PlayerPrefs); ClearPersistedAsync removes it.
        {
            PlayerPrefs.Clear();
            var store = new MemoryCredentialStore { IsSecureStorageAvailable = true };
            var session = new AccountSession();
            session.CredentialStore = store;
            session.Awake();
            session.ApplyTokensAsync(new AuthTokens { refreshToken = "rt-session", localId = "u1" })
                .GetAwaiter().GetResult();
            Check(store.Data.TryGetValue("refreshToken", out var vs) && vs == "rt-session",
                "AccountSession stores refresh token in secure store");
            Check(PlayerPrefs.GetString("VELOX.Account.RefreshToken", "__NONE__") == "__NONE__",
                "AccountSession does NOT write refresh token to PlayerPrefs");
            Check(PlayerPrefs.GetString("VELOX.Account.LocalId", "__NONE__") == "u1",
                "AccountSession keeps localId (identifier) in PlayerPrefs");
            session.ClearPersistedAsync().GetAwaiter().GetResult();
            Check(!store.Data.ContainsKey("refreshToken"),
                "AccountSession sign-out removes refresh token from secure store");
            Check(PlayerPrefs.GetString("VELOX.Account.RefreshToken", "__NONE__") == "__NONE__",
                "AccountSession sign-out deletes legacy plaintext refresh token");
        }

        Console.WriteLine();
        Console.WriteLine("RESULT: " + _pass + " passed, " + _fail + " failed");
        Environment.Exit(_fail == 0 ? 0 : 1);
    }
}
