using NUnit.Framework;
using UnityEngine;
using UltimateFootballChase.Core;
using UltimateFootballChase.Gameplay;
using UltimateFootballChase.Input;
using UltimateFootballChase.Difficulty;
using UltimateFootballChase.PowerUps;

namespace UltimateFootballChase.Tests
{
    public sealed class Phase1Tests
    {
        [Test]
        public void ReviveCost_Doubles_ThenCapsAtThree_AndNeverChargesWhenInsufficient()
        {
            var session = new RunSession(7);
            Assert.AreEqual(1, session.NextReviveCost(3));
            Assert.IsTrue(session.TrySpendRevive(3));
            Assert.AreEqual(2, session.NextReviveCost(3));
            Assert.IsTrue(session.TrySpendRevive(3));
            Assert.AreEqual(3, session.NextReviveCost(3));
            Assert.IsTrue(session.TrySpendRevive(3));
            Assert.AreEqual(3, session.NextReviveCost(3));
            Assert.IsFalse(session.TrySpendRevive(3));
            Assert.AreEqual(1, session.Keys);
            Assert.AreEqual(3, session.Revives);
        }

        [Test]
        public void Movement_ClampsToThreeLanes_AndBuffersTheNextLaneSwitch()
        {
            var settings = ScriptableObject.CreateInstance<RunConfig>();
            var player = new GameObject("player");
            var visual = new GameObject("visual").transform;
            visual.SetParent(player.transform);
            try
            {
                var motor = player.AddComponent<RunnerMotor>();
                motor.Initialize(settings, visual);
                motor.Queue(RunAction.Right);
                motor.Queue(RunAction.Left); // waits until first switch ends
                Assert.AreEqual(2, motor.Lane);
                motor.Tick(settings.LaneChangeSeconds);
                motor.Tick(settings.LaneChangeSeconds);
                Assert.AreEqual(1, motor.Lane);
                Assert.AreEqual(0f, motor.X, .01f);
                motor.Queue(RunAction.Left);
                motor.Tick(settings.LaneChangeSeconds);
                motor.Queue(RunAction.Left);
                Assert.AreEqual(0, motor.Lane);
            }
            finally { Object.DestroyImmediate(player); Object.DestroyImmediate(settings); }
        }

        [Test]
        public void SwipeDownWhileAirborne_FastFallsThenSlidesOnlyAfterLanding()
        {
            var settings = ScriptableObject.CreateInstance<RunConfig>();
            var player = new GameObject("player");
            var visual = new GameObject("visual").transform;
            visual.SetParent(player.transform);
            try
            {
                var motor = player.AddComponent<RunnerMotor>();
                motor.Initialize(settings, visual);
                motor.Queue(RunAction.Jump);
                motor.Tick(settings.JumpSeconds * .2f);
                motor.Queue(RunAction.Slide);
                Assert.IsFalse(motor.IsSliding, "Never grant low-profile clearance in midair");
                motor.Tick(settings.JumpSeconds * .3f);
                Assert.IsTrue(motor.IsSliding, "Buffered slide should start on landing");
            }
            finally { Object.DestroyImmediate(player); Object.DestroyImmediate(settings); }
        }

        [Test]
        public void WorldRows_LeaveTwoSafeLanes_AndHaveOriginalVariety()
        {
            var settings = ScriptableObject.CreateInstance<RunConfig>();
            var profile = ScriptableObject.CreateInstance<DifficultyProfile>();
            var bonus = ScriptableObject.CreateInstance<PowerUpConfig>();
            var worldGo = new GameObject("world");
            try
            {
                var track = worldGo.AddComponent<TrackWorld>();
                track.Initialize(settings, profile, bonus);
                Assert.GreaterOrEqual(track.Hazards.Count, 3);
                var kinds = new System.Collections.Generic.HashSet<HazardKind>();
                foreach (Hazard hazard in track.Hazards)
                {
                    kinds.Add(hazard.Kind);
                    Assert.That(hazard.Lane, Is.InRange(0, 2));
                    int obstaclesInSameRow = 0;
                    foreach (Hazard other in track.Hazards)
                        if (Mathf.Abs(other.Object.transform.position.z - hazard.Object.transform.position.z) < .1f)
                            obstaclesInSameRow++;
                    Assert.AreEqual(1, obstaclesInSameRow, "At least two lanes must remain clear in every phase-1 row");
                }
                Assert.That(kinds.Count, Is.InRange(1, 2), "Training only: low barrier and blocker");
                Assert.IsFalse(kinds.Contains(HazardKind.SlidingTackle));
                track.Tick(1f / 60f, settings.StartingSpeedMetersPerSecond);
                Assert.AreEqual(9f / 60f, track.Hazards[0].PreviousZ - track.Hazards[0].HitZ, .01f);
            }
            finally { Object.DestroyImmediate(worldGo); Object.DestroyImmediate(settings); Object.DestroyImmediate(profile); Object.DestroyImmediate(bonus); }
        }
    }
}
