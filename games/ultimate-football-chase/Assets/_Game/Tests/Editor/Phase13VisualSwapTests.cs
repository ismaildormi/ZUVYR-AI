using NUnit.Framework;
using UnityEngine;
using UltimateFootballChase.Core;
using UltimateFootballChase.Difficulty;
using UltimateFootballChase.Gameplay;
using UltimateFootballChase.Input;
using UltimateFootballChase.PowerUps;
using UltimateFootballChase.Visuals;

namespace UltimateFootballChase.Tests
{
    public sealed class Phase13VisualSwapTests
    {
        [Test]
        public void MissingPrefabKeepsGreyboxAndOriginalCollisionSemantics()
        {
            var config = ScriptableObject.CreateInstance<RunConfig>();
            var curve = ScriptableObject.CreateInstance<DifficultyProfile>();
            var power = ScriptableObject.CreateInstance<PowerUpConfig>();
            var catalog = ScriptableObject.CreateInstance<VisualCatalog>();
            var world = new GameObject("world");
            try
            {
                var track = world.AddComponent<TrackWorld>();
                track.Initialize(config, curve, power, art: catalog);
                Assert.IsNull(catalog.HazardPrefab(HazardKind.LowBarrier));
                Assert.Greater(track.Hazards.Count, 0);
                Hazard first = track.Hazards[0];
                Assert.AreEqual(HazardKind.LowBarrier, first.Kind);
                Assert.IsNotNull(first.Model.Find("JUMP"));
                Assert.IsNotNull(first.Model.Find("Approach warning"));
                Assert.AreEqual(first.Object.transform.position.z - .45f, first.HitZ, .001f);
            }
            finally
            {
                Object.DestroyImmediate(world); Object.DestroyImmediate(config);
                Object.DestroyImmediate(curve); Object.DestroyImmediate(power); Object.DestroyImmediate(catalog);
            }
        }

        [Test]
        public void ReplacementArtIsVisualOnlyAndKeepsWarningAndArcadeHitBox()
        {
            var config = ScriptableObject.CreateInstance<RunConfig>();
            var curve = ScriptableObject.CreateInstance<DifficultyProfile>();
            var power = ScriptableObject.CreateInstance<PowerUpConfig>();
            var catalog = ScriptableObject.CreateInstance<VisualCatalog>();
            var prefab = GameObject.CreatePrimitive(PrimitiveType.Cube);
            var world = new GameObject("world");
            try
            {
                prefab.name = "Original platform barrier model";
                catalog.LowBarrierPrefab = prefab;
                var track = world.AddComponent<TrackWorld>();
                track.Initialize(config, curve, power, art: catalog);
                Hazard first = track.Hazards[0];
                Assert.AreSame(prefab, catalog.HazardPrefab(HazardKind.LowBarrier));
                Assert.IsNull(first.Model.Find("JUMP"));
                Assert.IsNotNull(first.Model.Find("Approach warning"));
                var instance = first.Model.GetChild(0);
                StringAssert.StartsWith(prefab.name, instance.name);
                Assert.IsFalse(instance.GetComponent<Collider>().enabled);
                Assert.AreEqual(first.Object.transform.position.z - .45f, first.HitZ, .001f);
                track.Tick(1f / 60f, config.StartingSpeedMetersPerSecond);
                Assert.AreEqual(9f / 60f, first.PreviousZ - first.HitZ, .01f);
            }
            finally
            {
                Object.DestroyImmediate(world); Object.DestroyImmediate(prefab);
                Object.DestroyImmediate(config); Object.DestroyImmediate(curve);
                Object.DestroyImmediate(power); Object.DestroyImmediate(catalog);
            }
        }

        [Test]
        public void ClearedStationTileIsVisualOnlyAndDoesNotReplaceTrackPlanning()
        {
            var config = ScriptableObject.CreateInstance<RunConfig>();
            var curve = ScriptableObject.CreateInstance<DifficultyProfile>();
            var power = ScriptableObject.CreateInstance<PowerUpConfig>();
            var catalog = ScriptableObject.CreateInstance<VisualCatalog>();
            var prefab = GameObject.CreatePrimitive(PrimitiveType.Cube);
            var world = new GameObject("world");
            try
            {
                prefab.name = "Original station segment";
                catalog.StationTilePrefab = prefab;
                var track = world.AddComponent<TrackWorld>();
                track.Initialize(config, curve, power, art: catalog);
                Transform firstTile = world.transform.GetChild(0);
                Assert.IsNull(firstTile.Find("Asphalt"));
                Assert.IsFalse(firstTile.GetChild(0).GetComponent<Collider>().enabled);
                Assert.Greater(track.Hazards.Count, 0);
                int initialHazards = track.Hazards.Count;
                track.Tick(1f / 60f, config.StartingSpeedMetersPerSecond);
                Assert.GreaterOrEqual(track.Hazards.Count, initialHazards);
            }
            finally
            {
                Object.DestroyImmediate(world); Object.DestroyImmediate(prefab);
                Object.DestroyImmediate(config); Object.DestroyImmediate(curve);
                Object.DestroyImmediate(power); Object.DestroyImmediate(catalog);
            }
        }

        [Test]
        public void ExternalRigUsesItsAuthoredScaleAndDoesNotChangeLaneMovement()
        {
            var config = ScriptableObject.CreateInstance<RunConfig>();
            var player = new GameObject("player");
            try
            {
                var greybox = new GameObject("reversible fallback").transform;
                greybox.SetParent(player.transform, false);
                var motor = player.AddComponent<RunnerMotor>();
                motor.Initialize(config, greybox);
                var art = new GameObject("cleared mesh").transform;
                art.SetParent(player.transform, false);
                art.localScale = new Vector3(1.2f, 1.2f, 1.2f);
                motor.SetExternalArt(art);
                motor.Queue(RunAction.Right);
                motor.Tick(config.LaneChangeSeconds);
                motor.Queue(RunAction.Jump);
                motor.Tick(config.JumpSeconds / 4f);
                Assert.IsTrue(motor.UsesExternalArt);
                Assert.IsFalse(greybox.gameObject.activeSelf);
                Assert.AreSame(art, motor.Visual);
                Assert.AreEqual(new Vector3(1.2f, 1.2f, 1.2f), art.localScale);
                Assert.AreEqual(2, motor.Lane);
                Assert.IsTrue(motor.IsJumping);
                motor.ResetMotor();
                Assert.AreEqual(1, motor.Lane);
                Assert.AreEqual(new Vector3(1.2f, 1.2f, 1.2f), art.localScale);
            }
            finally { Object.DestroyImmediate(player); Object.DestroyImmediate(config); }
        }

        [Test]
        public void OutfitAndComplexionAffectOnlyAssignedRendererSlots()
        {
            var root = new GameObject("licensed character");
            var shirt = GameObject.CreatePrimitive(PrimitiveType.Cube);
            var face = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            var cap = new GameObject("cap");
            try
            {
                shirt.transform.SetParent(root.transform, false);
                face.transform.SetParent(root.transform, false);
                cap.transform.SetParent(root.transform, false);
                var slots = root.AddComponent<AvatarAppearanceSlots>();
                slots.KitRenderers = new[] { shirt.GetComponent<Renderer>() };
                slots.SkinRenderers = new[] { face.GetComponent<Renderer>() };
                slots.Cap = cap;
                slots.Apply(Color.red, "deep", "cap");
                Assert.AreEqual(Color.red, shirt.GetComponent<Renderer>().material.color);
                Assert.IsTrue(cap.activeSelf);
                Assert.AreNotEqual(Color.red, face.GetComponent<Renderer>().material.color);
                slots.Apply(Color.green, "sunlit", "unknown");
                Assert.IsFalse(cap.activeSelf, "Unknown headwear must not turn on foreign objects");
                Assert.AreEqual(Color.green, shirt.GetComponent<Renderer>().material.color);
            }
            finally { Object.DestroyImmediate(root); }
        }
    }
}
