using System;
using NUnit.Framework;
using UnityEngine;
using UltimateFootballChase.Hub;

namespace UltimateFootballChase.Tests
{
    public sealed class Phase4Tests
    {
        [Test]
        public void HomeAndPlazaOpenFirst_MarketAndPitchUnlockOnlyAfterFiveCompletedStages()
        {
            var progress = new HubProgress();
            Assert.IsTrue(HubLayout.CanWalk(HubLayout.Centre(HubZone.Home), false));
            Assert.IsTrue(HubLayout.CanWalk(HubLayout.Centre(HubZone.CentralPlaza), false));
            Assert.IsFalse(HubLayout.CanWalk(HubLayout.Centre(HubZone.Market), false));
            Assert.IsFalse(HubLayout.CanWalk(HubLayout.Centre(HubZone.PracticePitch), false));
            Assert.IsFalse(HubStageProgression.IsExtendedHubUnlocked(progress));
            progress.CompletedStages = 4;
            Assert.IsFalse(HubStageProgression.IsExtendedHubUnlocked(progress));
            progress.CompletedStages = 5;
            Assert.IsTrue(HubStageProgression.IsExtendedHubUnlocked(progress));
            Assert.IsTrue(HubLayout.CanWalk(HubLayout.Centre(HubZone.Market), true));
            Assert.IsTrue(HubLayout.CanWalk(HubLayout.Centre(HubZone.PracticePitch), true));
            Assert.IsTrue(HubLayout.CanWalk(new Vector3(0, 0, 18), true)); // connected field path
            for (int x = 16; x <= 40; x += 4)
                for (int z = -12; z <= 12; z += 4)
                    Assert.IsFalse(HubLayout.CanWalk(new Vector3(x, 0, z), false), "Market bypass");
            for (int x = -12; x <= 12; x += 4)
                for (int z = 20; z <= 44; z += 4)
                    Assert.IsFalse(HubLayout.CanWalk(new Vector3(x, 0, z), false), "Pitch bypass");
        }

        [Test]
        public void StageCompletion_RequiresFiveSeparateQualifiedRuns_AndRejectsBadDistances()
        {
            var progress = new HubProgress();
            Assert.AreEqual(250f, HubStageProgression.NextGoal(progress)); // provisional per-stage distance
            Assert.IsFalse(HubStageProgression.TryCompleteNextStage(progress, 249.99f));
            Assert.IsFalse(HubStageProgression.TryCompleteNextStage(progress, float.NaN));
            Assert.IsFalse(HubStageProgression.TryCompleteNextStage(progress, float.PositiveInfinity));
            for (int stage = 1; stage <= 5; stage++)
            {
                // An arbitrarily long run advances only ONE stage; it cannot skip stages 1–5.
                Assert.IsTrue(HubStageProgression.TryCompleteNextStage(progress, 2000f));
                Assert.AreEqual(stage, progress.CompletedStages);
                if (stage < 5) Assert.IsFalse(HubStageProgression.IsExtendedHubUnlocked(progress));
            }
            Assert.IsTrue(HubStageProgression.IsExtendedHubUnlocked(progress));
        }

        [Test]
        public void GuestRepositoryBoundary_CanBeSwappedForFutureAuthenticatedStorage()
        {
            var fake = new MemoryHubRepository();
            HubGuestProgress.UseRepository(fake);
            try
            {
                bool completed = HubGuestProgress.RecordFinishedRun(250f, out HubProgress progress);
                Assert.IsTrue(completed);
                Assert.AreEqual(1, progress.CompletedStages);
                Assert.AreEqual(1, progress.FinishedRuns);
                progress.SelectedOutfit = "amber";
                progress.Position = new Vector3(-27f, 0f, 4f);
                HubGuestProgress.Save(progress);
                var loaded = HubGuestProgress.Load();
                Assert.AreEqual("amber", loaded.SelectedOutfit);
                Assert.AreEqual(progress.Position, loaded.Position);
                Assert.IsFalse(HubGuestProgress.RecordFinishedRun(100f, out progress));
                Assert.AreEqual(1, progress.CompletedStages);
                Assert.AreEqual(2, progress.FinishedRuns);
                Assert.AreEqual(250f, progress.BestRunMeters);
            }
            finally { HubGuestProgress.UseRepository(new LocalGuestHubRepository()); }
        }

        [Test]
        public void AuthoredWorldHasWardrobeGoalkeeperAndSeasonalVariants()
        {
            var world = new HubWorldBuilder();
            try
            {
                Assert.NotNull(world.Mannequin);
                Assert.NotNull(world.Goalkeeper);
                Assert.NotNull(world.Window);
                Assert.AreEqual(4, world.Birds.Count);
                world.SetStageTrophies(5);
                world.SetUnlocked(false);
                for (int season = 0; season < 4; season++) world.SetSeason(season);
                world.SetDaylight(false);
                world.Animate(2f);
                world.SetDaylight(true);
            }
            finally { UnityEngine.Object.DestroyImmediate(world.Root.gameObject); }
        }

        [Test]
        public void SeasonRotationAndDayNight_UseExpectedTimeBoundaries()
        {
            Assert.IsFalse(HubLayout.IsDay(5));
            Assert.IsTrue(HubLayout.IsDay(6));
            Assert.IsTrue(HubLayout.IsDay(18));
            Assert.IsFalse(HubLayout.IsDay(19));
            var jan = new DateTime(2026, 1, 15, 0, 0, 0, DateTimeKind.Utc);
            var mar = new DateTime(2026, 3, 15, 0, 0, 0, DateTimeKind.Utc);
            var apr = new DateTime(2026, 4, 15, 0, 0, 0, DateTimeKind.Utc);
            Assert.AreEqual(HubLayout.SeasonAt(jan, 3), HubLayout.SeasonAt(mar, 3));
            Assert.AreNotEqual(HubLayout.SeasonAt(mar, 3), HubLayout.SeasonAt(apr, 3));
            Assert.AreNotEqual(HubLayout.SeasonAt(jan, 2), HubLayout.SeasonAt(mar, 2));
        }

        private sealed class MemoryHubRepository : IHubProgressRepository
        {
            private string json = JsonUtility.ToJson(new HubProgress());
            public HubProgress Load() => JsonUtility.FromJson<HubProgress>(json);
            public void Save(HubProgress p) { json = JsonUtility.ToJson(p); }
        }
    }
}
