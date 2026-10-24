using NUnit.Framework;
using UltimateFootballChase.Core;
using UltimateFootballChase.Hub;
using UltimateFootballChase.Missions;
using UltimateFootballChase.Characters;
using UltimateFootballChase.Seasons;
using UltimateFootballChase.Difficulty;
using UltimateFootballChase.PowerUps;
using UltimateFootballChase.Gameplay;
using UltimateFootballChase.Input;
using UnityEngine;
using System;

namespace UltimateFootballChase.Tests
{
    public sealed class Phase10Tests
    {
        [Test]
        public void Chain_OnlyAdvancesOnCompleteSet_AndResumesFromSnapshot()
        {
            var mission = new MissionChain();
            for (int i = 0; i < 15; i++) mission.Jump();
            for (int i = 0; i < 9; i++) mission.AvoidTackle();
            for (int i = 0; i < 100; i++) mission.CollectCoin();
            Assert.AreEqual(1, mission.Multiplier);
            var resumed = new MissionChain(mission.Snapshot());
            Assert.AreEqual(15, resumed.Jumps);
            resumed.AvoidTackle();
            Assert.AreEqual(2, resumed.Multiplier);
            Assert.AreEqual(0, resumed.Jumps);
            Assert.AreEqual(0, resumed.AvoidedTackles);
            Assert.AreEqual(0, resumed.Coins);
        }
        [Test]
        public void Chain_ClampsMalformedData_AndCapsAtThirty()
        {
            var malformed = new MissionChain(new MissionChainSnapshot {
                CompletedGroups = 999, Jumps = int.MaxValue, Coins = int.MaxValue, AvoidedTackles = -99
            });
            Assert.AreEqual(30, malformed.Multiplier);
            Assert.AreEqual(0, malformed.Jumps);
            malformed.Jump(); malformed.CollectCoin(); malformed.AvoidTackle();
            Assert.AreEqual(30, malformed.Multiplier);
        }
        [Test]
        public void Score_IsLocalOnly_NeverBecomesTrustedStageCurrency()
        {
            var session = new RunSession(0);
            session.Advance(40f);
            session.CollectCoin();
            Assert.AreEqual(50, session.PreviewScore);
            Assert.AreEqual(1, session.Missions.Multiplier);
            Assert.IsNull(typeof(HubProgress).GetField("RankedScore"));
            Assert.IsNull(typeof(HubProgress).GetField("PrizeBalance"));
        }
        [Test]
        public void FiveGreyboxTreatmentsPerCharacter_StageGatesCannotBypassSanitizer()
        {
            Assert.AreEqual(5, OriginalRoster.KitIds.Length);
            Assert.IsTrue(OriginalRoster.CanSelectKit("teal", 0));
            Assert.IsFalse(OriginalRoster.CanSelectKit("storm", 4));
            Assert.IsTrue(OriginalRoster.CanSelectKit("storm", 5));
            Assert.IsFalse(OriginalRoster.CanSelectKit("dawn", 9));
            Assert.IsTrue(OriginalRoster.CanSelectKit("dawn", 10));
            var preview = new HubProgress { CompletedStages = 0, SelectedOutfit = "dawn" };
            HubProgressSanitizer.Clean(preview);
            Assert.AreEqual("teal", preview.SelectedOutfit);
            Assert.AreNotEqual(OriginalRoster.KitColor("kivo", "teal"),
                OriginalRoster.KitColor("mira", "teal"));
        }
        [Test]
        public void AcceptedJumpCounter_RecordsBufferedStartNotRepeatedTap()
        {
            var config = ScriptableObject.CreateInstance<RunConfig>();
            var root = new GameObject("Jump QA");
            try
            {
                var visual = new GameObject("Visual").transform;
                visual.SetParent(root.transform);
                var runner = root.AddComponent<RunnerMotor>();
                runner.Initialize(config, visual);
                runner.Queue(RunAction.Jump);
                Assert.AreEqual(1, runner.AcceptedJumps);
                runner.Queue(RunAction.Jump); // buffered, not yet an accepted jump
                Assert.AreEqual(1, runner.AcceptedJumps);
                runner.Tick(config.JumpSeconds);
                Assert.AreEqual(2, runner.AcceptedJumps);
                runner.ResetMotor();
                Assert.AreEqual(0, runner.AcceptedJumps);
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(root);
                UnityEngine.Object.DestroyImmediate(config);
            }
        }
        [Test]
        public void SeasonalRoute_ChangesDecorButNeverPlannerGeometry()
        {
            var cfg = ScriptableObject.CreateInstance<RunConfig>();
            var diff = ScriptableObject.CreateInstance<DifficultyProfile>();
            var power = ScriptableObject.CreateInstance<PowerUpConfig>();
            var left = new GameObject("Bloom route");
            var right = new GameObject("Frost route");
            try
            {
                var bloom = left.AddComponent<TrackWorld>();
                var frost = right.AddComponent<TrackWorld>();
                bloom.Initialize(cfg, diff, power, 42, 0);
                frost.Initialize(cfg, diff, power, 42, 3);
                Assert.AreEqual(bloom.Hazards.Count, frost.Hazards.Count);
                for (int i = 0; i < bloom.Hazards.Count; i++)
                {
                    Assert.AreEqual(bloom.Hazards[i].Lane, frost.Hazards[i].Lane);
                    Assert.AreEqual(bloom.Hazards[i].Kind, frost.Hazards[i].Kind);
                    Assert.AreEqual(bloom.Hazards[i].Object.transform.position,
                        frost.Hazards[i].Object.transform.position);
                }
                Assert.AreNotEqual(RunnerSeasons.Asphalt(0), RunnerSeasons.Asphalt(3));
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(left); UnityEngine.Object.DestroyImmediate(right);
                UnityEngine.Object.DestroyImmediate(cfg); UnityEngine.Object.DestroyImmediate(diff);
                UnityEngine.Object.DestroyImmediate(power);
            }
        }
        [Test]
        public void BestPreview_IsClamped_AndNeverStoredAsTrustedRank()
        {
            var invalid = new HubProgress { BestPreviewScore = long.MaxValue };
            HubProgressSanitizer.Clean(invalid);
            Assert.AreEqual(1000000000L, invalid.BestPreviewScore);
            Assert.IsNull(typeof(HubProgress).GetField("VerifiedRank"));
        }
        [Test]
        public void RunnerDoesNotReplaceStartedSessionWithAccountSnapshot()
        {
            var session = new RunSession(0);
            session.Advance(1f);
            session.RestoreMissionsBeforeRun(new MissionChainSnapshot { CompletedGroups = 29 });
            Assert.AreEqual(1, session.Missions.Multiplier);
        }
    }
}
