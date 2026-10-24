using System;
using System.Linq;
using System.Threading.Tasks;
using NUnit.Framework;
using UltimateFootballChase.Backend;
using UltimateFootballChase.Characters;
using UltimateFootballChase.Hub;
using UltimateFootballChase.Missions;
using UltimateFootballChase.Settings;
using UltimateFootballChase.Showdown;

namespace UltimateFootballChase.Tests
{
    public sealed class Phase9Tests
    {
        private static ShowdownEventView Event() => new ShowdownEventView
        {
            EventId = "autumn-2026-01", Title = "Original community challenge", Status = "scheduled",
            StartsUtcTicks = new DateTime(2026, 10, 25, 0, 0, 0, DateTimeKind.Utc).Ticks,
            EndsUtcTicks = new DateTime(2026, 10, 29, 0, 0, 0, DateTimeKind.Utc).Ticks
        };
        [Test]
        public void Showdown_RequiresThreeToFiveDayServerSchedule_NotClientResult()
        {
            var view = Event();
            Assert.IsTrue(ShowdownPolicy.IsValid(view));
            view.EndsUtcTicks = view.StartsUtcTicks + TimeSpan.FromDays(2).Ticks;
            Assert.IsFalse(ShowdownPolicy.IsValid(view));
            view.EndsUtcTicks = view.StartsUtcTicks + TimeSpan.FromDays(6).Ticks;
            Assert.IsFalse(ShowdownPolicy.IsValid(view));
            view = Event(); view.Title = "<fake winner>";
            Assert.IsFalse(ShowdownPolicy.IsValid(view));
            view = Event(); view.Status = "winner";
            Assert.IsFalse(ShowdownPolicy.IsValid(view));
        }
        [Test]
        public async Task Showdown_WithoutPublisher_IsExplicitlyUnavailable()
        {
            var result = await new ShowdownService(new UnavailableShowdownGateway()).PublicStatusAsync();
            StringAssert.Contains("UNAVAILABLE", result);
            Assert.IsFalse(typeof(IShowdownGateway).GetMethods().Any(x => x.Name.Contains("Submit") ||
                x.Name.Contains("Unlock") || x.Name.Contains("Award")));
        }
        [Test]
        public void Settings_ClampVolumes_AndOwnMusicDoesNotChangeEffects()
        {
            var options = new HubOptions { MusicVolume = float.NaN, SfxVolume = 3f, Language = "xx", Region = "FR" };
            options.Normalize();
            Assert.AreEqual(.65f, options.MusicVolume);
            Assert.AreEqual(1f, options.SfxVolume);
            Assert.AreEqual("en", options.Language);
            Assert.AreEqual("MA", options.Region);
            options.Change(SettingAction.ToggleMyMusic);
            Assert.IsTrue(options.UseMyMusic);
            Assert.AreEqual(1f, options.SfxVolume); // actual SFX channel has a separate AudioSource
            options.Change(SettingAction.NextLanguage);
            Assert.AreEqual("ar", options.Language);
            options.Change(SettingAction.NextLanguage);
            Assert.AreEqual("fr", options.Language);
        }
        [Test]
        public void Missions_ResetAtUtcBoundary_AndDoNotAddSpendableRewards()
        {
            var p = new HubProgress();
            var day = new DateTime(2026, 10, 25, 23, 0, 0, DateTimeKind.Utc);
            DailyMissions.RecordRun(p, day, 210f, 9);
            DailyMissions.RecordRun(p, day.AddMinutes(1), 300f, 11);
            Assert.AreEqual(2, p.MissionRuns);
            StringAssert.Contains("20/20", DailyMissions.Status(p, day));
            StringAssert.Contains("0/20", DailyMissions.Status(p, day.AddHours(2)));
            DailyMissions.RecordRun(p, day.AddHours(2), 50f, 1);
            Assert.AreEqual(1, p.MissionRuns);
            Assert.AreEqual(1, p.MissionCoins);
            Assert.AreEqual(50f, p.MissionDistanceMetres);
        }
        [Test]
        public void OriginalRosterAndLeague_AreBoundedPreviewContent()
        {
            Assert.AreEqual(4, OriginalRoster.Ids.Length);
            Assert.IsTrue(OriginalRoster.Contains("nexa"));
            Assert.IsFalse(OriginalRoster.Contains("not-a-character"));
            Assert.AreEqual(8, FictionalLeague.Teams.Length);
            Assert.AreEqual(8, FictionalLeague.Teams.Select(team => team.Name).Distinct().Count());
            Assert.AreEqual(1, HubStory.ChapterFor(10));
            Assert.AreEqual(2, HubStory.ChapterFor(11));
            Assert.AreEqual(4, HubStory.ChapterFor(31));
        }
        [Test]
        public void AccountPreviewMerge_ChoosesOneDailyCounterSet_WithoutSumming()
        {
            var remote = new HubProgress { MissionUtcDayTicks = 100, MissionCoins = 10, LastSavedUtcTicks = 100 };
            var local = new HubProgress { MissionUtcDayTicks = 100, MissionCoins = 15, LastSavedUtcTicks = 200,
                SelectedCharacter = "mira", Options = new HubOptions { UseMyMusic = true } };
            HubProgress merged = AccountHubPolicy.Merge(remote, local);
            Assert.AreEqual(15, merged.MissionCoins);
            Assert.AreEqual("mira", merged.SelectedCharacter);
            Assert.IsTrue(merged.Options.UseMyMusic);
        }
    }
}
