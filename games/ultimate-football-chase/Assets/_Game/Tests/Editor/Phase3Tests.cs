using System.Collections.Generic;
using NUnit.Framework;
using UnityEngine;
using UltimateFootballChase.Core;
using UltimateFootballChase.Difficulty;
using UltimateFootballChase.Gameplay;
using UltimateFootballChase.Input;
using UltimateFootballChase.PowerUps;

namespace UltimateFootballChase.Tests
{
    public sealed class Phase3Tests
    {
        private PowerUpConfig config;
        [SetUp] public void SetUp() { config = ScriptableObject.CreateInstance<PowerUpConfig>(); }
        [TearDown] public void TearDown() { Object.DestroyImmediate(config); }

        [Test]
        public void MagnetShoesAndJetpack_HaveIndependentCountdowns_AndRefreshNeverCutsTime()
        {
            var power = new PowerUpState(config);
            power.Collect(PowerKind.Magnet);
            power.Collect(PowerKind.SuperShoes);
            power.Tick(2f);
            Assert.AreEqual(10f, power.Remaining(PowerKind.Magnet), .001f);
            Assert.AreEqual(8f, power.Remaining(PowerKind.SuperShoes), .001f);
            power.Collect(PowerKind.Magnet);
            power.Collect(PowerKind.Jetpack);
            Assert.AreEqual(12f, power.Remaining(PowerKind.Magnet), .001f);
            Assert.IsTrue(power.Flying && power.IsProtected);
            power.Tick(8f);
            Assert.IsFalse(power.Flying);
            Assert.IsFalse(power.IsProtected);
            Assert.IsTrue(power.Active(PowerKind.Magnet));
            // Pausing is implemented by not calling Tick; real time cannot drain the power.
            Assert.AreEqual(4f, power.Remaining(PowerKind.Magnet), .001f);
        }

        [Test]
        public void Hoverboard_RequiresManualActivation_ProtectsExactlyThirtySeconds_ThenExpires()
        {
            var power = new PowerUpState(config);
            Assert.AreEqual(1, power.BoardCharges); // explicit greybox test stock, not an economy balance
            Assert.IsFalse(power.IsProtected);
            Assert.IsTrue(power.TryActivateBoard());
            Assert.AreEqual(PowerUpConfig.HoverboardProtectionSeconds, power.Remaining(PowerKind.Hoverboard));
            Assert.IsTrue(power.IsProtected);
            Assert.IsFalse(power.TryActivateBoard()); // can't consume a second board while active
            power.Tick(29.9f);
            Assert.IsTrue(power.IsProtected);
            power.Tick(.1f);
            Assert.IsFalse(power.IsProtected);
            Assert.IsFalse(power.TryActivateBoard());
            power.Collect(PowerKind.Hoverboard);
            Assert.IsTrue(power.TryActivateBoard());
            power.Reset();
            Assert.IsFalse(power.IsProtected);
            Assert.AreEqual(1, power.BoardCharges);
        }

        [Test]
        public void PoweredJumpClearsTrainHeight_AndJetpackLandsWithBriefGrace()
        {
            var run = ScriptableObject.CreateInstance<RunConfig>();
            var player = new GameObject("player");
            var visual = new GameObject("visual").transform;
            visual.SetParent(player.transform);
            try
            {
                var motor = player.AddComponent<RunnerMotor>();
                motor.Initialize(run, visual);
                motor.SetPowerEffects(true, config.SuperShoesHeightMultiplier, false, 0, 0);
                motor.Queue(RunAction.Jump);
                motor.Tick(run.JumpSeconds * .5f);
                Assert.Greater(motor.FeetHeight, 2.7f);
                motor.SetPowerEffects(false, 1f, true, config.JetpackFlightHeightMetres, config.JetpackLandingGraceSeconds);
                motor.Tick(.05f);
                Assert.AreEqual(config.JetpackFlightHeightMetres, motor.FeetHeight, .001f);
                motor.SetPowerEffects(false, 1f, false, 0f, config.JetpackLandingGraceSeconds);
                motor.Tick(.05f);
                Assert.IsTrue(motor.IsInvulnerable);
                Assert.AreEqual(0f, motor.FeetHeight, .001f);
            }
            finally { Object.DestroyImmediate(player); Object.DestroyImmediate(run); }
        }

        [Test]
        public void PreviewIsSortedAndReflectsActualPooledUpcomingThreatsAndRewards()
        {
            var run = ScriptableObject.CreateInstance<RunConfig>();
            var difficulty = ScriptableObject.CreateInstance<DifficultyProfile>();
            var root = new GameObject("track");
            try
            {
                var world = root.AddComponent<TrackWorld>();
                world.Initialize(run, difficulty, config);
                var events = new List<UpcomingEvent>();
                world.FillUpcoming(events);
                Assert.GreaterOrEqual(events.Count, 3);
                for (int i = 1; i < events.Count; i++)
                    Assert.LessOrEqual(events[i - 1].Distance, events[i].Distance);
                Assert.AreEqual("MAGNET", events[1].Name); // first pickup at z=43; first obstacle at z=35
                Assert.AreEqual("LOWBARRIER", events[0].Name);
                Assert.AreEqual(PowerKind.Magnet, world.PowerPickups[0].Kind);
                Assert.AreEqual(1, world.PowerPickups.Count);
            }
            finally { Object.DestroyImmediate(root); Object.DestroyImmediate(run); Object.DestroyImmediate(difficulty); }
        }
    }
}
