using System;
using NUnit.Framework;
using UnityEngine;
using UltimateFootballChase.Difficulty;
using UltimateFootballChase.PowerUps;
using UltimateFootballChase.Gameplay;

namespace UltimateFootballChase.Tests
{
    public sealed class Phase2Tests
    {
        private DifficultyProfile profile;
        [SetUp] public void SetUp() { profile = ScriptableObject.CreateInstance<DifficultyProfile>(); }
        [TearDown] public void TearDown() { UnityEngine.Object.DestroyImmediate(profile); Object.DestroyImmediate(bonus); }

        [Test]
        public void Speed_JumpsThreePercentOnlyOnCompleted100MetreSteps_AndCapsAt2000()
        {
            Assert.AreEqual(9f, profile.SpeedAt(0f, 9f), .0001f);
            Assert.AreEqual(9f, profile.SpeedAt(99.99f, 9f), .0001f);
            Assert.AreEqual(9f * 1.03f, profile.SpeedAt(100f, 9f), .0001f);
            Assert.AreEqual(9f * (float)Math.Pow(1.03, 7), profile.SpeedAt(749.9f, 9f), .0001f);
            Assert.AreEqual(9f * (float)Math.Pow(1.03, 20), profile.SpeedAt(2000f, 9f), .0001f);
            Assert.AreEqual(profile.SpeedAt(2000f, 9f), profile.SpeedAt(999999f, 9f), .0001f);
        }

        [TestCase(0f, 0)] [TestCase(249.99f, 0)] [TestCase(250f, 1)]
        [TestCase(749.99f, 1)] [TestCase(750f, 2)]
        [TestCase(1499.99f, 2)] [TestCase(1500f, 3)]
        [TestCase(10000f, 3)]
        public void TierBoundaries_AreExactlyFromDocument(float distance, int expected)
            => Assert.AreEqual(expected, profile.TierAt(distance));

        [Test]
        public void SpawnRate_IsLinearAndBoundedAtTwoThousand()
        {
            float a = profile.SpawnRateAt(0);
            float mid = profile.SpawnRateAt(1000);
            float b = profile.SpawnRateAt(2000);
            Assert.AreEqual((a + b) / 2f, mid, 1e-6f);
            Assert.AreEqual(b, profile.SpawnRateAt(9000), 1e-6f);
            Assert.Greater(b, a);
            Assert.Greater(profile.SpacingAt(0), profile.SpacingAt(2000));
        }

        [Test]
        public void SpacingAtEveryTier_AllowsTwoLaneSwitchesAtPeakSpeed()
        {
            // The PDF does not specify the reaction margin: this is a provisional safety floor.
            const float twoSwitchesAndReaction = .18f * 2f + .5f;
            for (int metres = 0; metres <= 5000; metres += 25)
                Assert.Greater(profile.SpacingAt(metres) / profile.SpeedAt(metres, 9f),
                    twoSwitchesAndReaction, "Too little lane-change time at " + metres + "m");
        }

        [Test]
        public void Planner_AllRowsOfferSafeLane_AndUnlockThreatsAtCorrectTiers()
        {
            var planner = new ObstaclePlanner(42);
            var seen = new System.Collections.Generic.HashSet<HazardKind>();
            int doubleTackles = 0;
            int pairedJumpSlide = 0;
            bool previousJumpPair = false;
            int previousLane = -1;
            for (int i = 0; i < 300; i++)
            {
                float distance = i * 22f;
                var row = planner.Plan(distance, i, profile);
                Assert.That(row.SafeLane, Is.InRange(0, 2));
                Assert.Zero(row.OccupiedMask & (1 << row.SafeLane), "Impossible row at " + distance);
                Assert.That(row.OccupiedMask, Is.LessThan(7), "All 3 lanes must never be blocked");
                if (distance < 250f)
                    Assert.That(row.FirstKind, Is.AnyOf(HazardKind.LowBarrier, HazardKind.Blocker));
                if (distance < 1500f)
                {
                    Assert.AreNotEqual(HazardKind.PoliceCar, row.FirstKind);
                    Assert.AreNotEqual(HazardKind.Drone, row.FirstKind);
                }
                if (previousJumpPair && row.FirstKind == HazardKind.OverheadBeam && row.FirstLane == previousLane)
                    pairedJumpSlide++;
                previousJumpPair = distance >= 750f && distance < 1500f &&
                    i % 5 == 0 && row.FirstKind == HazardKind.LowBarrier;
                previousLane = row.FirstLane;
                if (row.HasSecond)
                {
                    Assert.GreaterOrEqual(distance, 1500f);
                    Assert.AreEqual(HazardKind.SlidingTackle, row.FirstKind);
                    Assert.AreEqual(HazardKind.SlidingTackle, row.SecondKind);
                    doubleTackles++;
                }
                seen.Add(row.FirstKind);
            }
            Assert.Greater(doubleTackles, 0);
            Assert.Greater(pairedJumpSlide, 0);
            Assert.IsTrue(seen.Contains(HazardKind.PoliceCar));
            Assert.IsTrue(seen.Contains(HazardKind.Drone));
            Assert.IsTrue(seen.Contains(HazardKind.Train));
        }

        [Test]
        public void StageOneTrack_HasNoTacklesAndCanRecycleWithoutAddingUnfairRows()
        {
            var cfg = ScriptableObject.CreateInstance<UltimateFootballChase.Core.RunConfig>();
            var bonus = ScriptableObject.CreateInstance<PowerUpConfig>();
            var root = new GameObject("TrackTest");
            try
            {
                TrackWorld world = root.AddComponent<TrackWorld>();
                world.Initialize(cfg, profile, bonus);
                float distance = 0f;
                for (int i = 0; i < 800; i++)
                {
                    float delta = .05f * profile.SpeedAt(distance, 9f);
                    world.Tick(.05f, delta / .05f);
                    distance += delta;
                    foreach (Hazard h in world.Hazards)
                        if (h.Object.transform.position.z + distance < 250f)
                            Assert.AreNotEqual(HazardKind.SlidingTackle, h.Kind);
                }
                Assert.Greater(world.Hazards.Count, 0);
            }
            finally { UnityEngine.Object.DestroyImmediate(root); UnityEngine.Object.DestroyImmediate(cfg); UnityEngine.Object.DestroyImmediate(bonus); }
        }
    }
}
