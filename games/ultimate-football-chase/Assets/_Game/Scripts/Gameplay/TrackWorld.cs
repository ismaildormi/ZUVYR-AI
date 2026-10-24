using System.Collections.Generic;
using UnityEngine;
using UltimateFootballChase.Core;
using UltimateFootballChase.Difficulty;
using UltimateFootballChase.PowerUps;
using UltimateFootballChase.Seasons;

namespace UltimateFootballChase.Gameplay
{
    public enum HazardKind { LowBarrier, OverheadBeam, Blocker, SlidingTackle, PoliceCar, Drone, Train }

    public sealed class Hazard
    {
        public GameObject Object;
        public Transform Model;
        public int Lane;
        public HazardKind Kind;
        public bool Checked;
        public float PreviousZ;
        public float HitZ
        {
            get
            {
                // Leading edge of each 3D greybox, not its centre; avoids "invisible late" crashes.
                float frontHalfLength = Kind == HazardKind.Train ? 2.5f :
                    Kind == HazardKind.PoliceCar ? 1.2f :
                    Kind == HazardKind.SlidingTackle ? .75f : .45f;
                float attack = Kind == HazardKind.SlidingTackle ? Model.localPosition.z : 0f;
                return Object.transform.position.z + attack - frontHalfLength;
            }
        }
    }

    public sealed class Pickup
    {
        public GameObject Object;
        public int Lane;
        public bool Checked;
        public float PreviousZ;
    }

    public sealed class PowerPickup
    {
        public GameObject Object;
        public PowerKind Kind;
        public bool Checked;
        public float PreviousZ;
    }

    public struct UpcomingEvent
    {
        public float Distance;
        public string Name;
        public Color Tint;
        public int Lane;
    }

    /// <summary>Deterministic track with document-exact tier boundaries and linearly increasing spawn rate.</summary>
    public sealed class TrackWorld : MonoBehaviour
    {
        private readonly List<Transform> tiles = new List<Transform>();
        private readonly List<Hazard> hazards = new List<Hazard>();
        private readonly Stack<Hazard>[] hazardPools = { new Stack<Hazard>(), new Stack<Hazard>(), new Stack<Hazard>(), new Stack<Hazard>(), new Stack<Hazard>(), new Stack<Hazard>(), new Stack<Hazard>() };
        private readonly List<Pickup> pickups = new List<Pickup>();
        private readonly Stack<Pickup> pickupPool = new Stack<Pickup>();
        private readonly List<PowerPickup> powerPickups = new List<PowerPickup>();
        private readonly Stack<PowerPickup>[] powerPools = { new Stack<PowerPickup>(), new Stack<PowerPickup>(), new Stack<PowerPickup>(), new Stack<PowerPickup>() };
        private RunConfig config;
        private DifficultyProfile difficulty;
        private PowerUpConfig powerConfig;
        private ObstaclePlanner planner;
        private int seed;
        private int seasonIndex;
        private float nextRowDistance;
        private float totalDistance;
        private float retireBehindMetres;
        private int rowNumber;
        private const float TileLength = 24f; // provisional geometry-only value
        private const float Horizon = 105f;
        public IReadOnlyList<Hazard> Hazards => hazards;
        public IReadOnlyList<Pickup> Pickups => pickups;
        public IReadOnlyList<PowerPickup> PowerPickups => powerPickups;

        public void Initialize(RunConfig settings, DifficultyProfile curve, PowerUpConfig bonuses,
            int worldSeed = 42, int season = 0)
        {
            config = settings;
            difficulty = curve;
            powerConfig = bonuses;
            seed = worldSeed; // local greybox repeatability; never trust this seed for real-prize scores
            seasonIndex = Mathf.Clamp(season, 0, 3); // route geometry/planner never depend on decoration
            planner = new ObstaclePlanner(seed);
            // Keep replay actors alive longer than the whole ring-buffer window at MAX speed.
            retireBehindMetres = difficulty.SpeedAt(DifficultyProfile.SpeedCapMetres,
                config.StartingSpeedMetersPerSecond) * config.ReplayHistorySeconds + 12f;
            for (int i = 0; i < 7; i++) tiles.Add(CreateTile(i * TileLength - TileLength));
            ResetWorld();
        }
        public void ResetWorld()
        {
            foreach (var hazard in hazards) { hazard.Object.SetActive(false); hazardPools[(int)hazard.Kind].Push(hazard); }
            foreach (var coin in pickups) { coin.Object.SetActive(false); pickupPool.Push(coin); }
            foreach (var power in powerPickups) { power.Object.SetActive(false); powerPools[(int)power.Kind].Push(power); }
            hazards.Clear(); pickups.Clear(); powerPickups.Clear();
            planner = new ObstaclePlanner(seed);
            for (int i = 0; i < tiles.Count; i++) tiles[i].position = new Vector3(0, 0, i * TileLength - TileLength);
            totalDistance = 0;
            nextRowDistance = config.FirstObstacleMeters;
            rowNumber = 0;
            PopulateHorizon();
        }
        private Transform CreateTile(float z)
        {
            var root = new GameObject("Recycled road segment").transform;
            root.SetParent(transform);
            root.position = new Vector3(0, 0, z);
            GreyboxFactory.Primitive("Asphalt", PrimitiveType.Cube, root, new Vector3(0, -.17f, 0),
                new Vector3(config.LaneWidth * 3.45f, .3f, TileLength), RunnerSeasons.Asphalt(seasonIndex));
            for (int i = -1; i <= 1; i++)
            {
                GreyboxFactory.Primitive("Running lane", PrimitiveType.Cube, root,
                    new Vector3(i * config.LaneWidth, -.006f, 0), new Vector3(config.LaneWidth - .08f, .03f, TileLength),
                    RunnerSeasons.LaneMark(seasonIndex) * (i == 0 ? 1f : .85f));
            }
            for (int side = -1; side <= 1; side += 2)
            {
                GreyboxFactory.Primitive("Unbranded barrier", PrimitiveType.Cube, root,
                    new Vector3(side * config.LaneWidth * 1.72f, .5f, 0),
                    new Vector3(.18f, 1f, TileLength), RunnerSeasons.Decor(seasonIndex));
                // Outside all three lanes; purely decorative, never a collision hazard.
                GreyboxFactory.Primitive("Original seasonal route banner", PrimitiveType.Cube, root,
                    new Vector3(side * config.LaneWidth * 1.99f, 1.8f, 0),
                    new Vector3(.45f, 1.1f, .22f), RunnerSeasons.Decor(seasonIndex));
            }
            return root;
        }
        private void PopulateHorizon()
        {
            while (nextRowDistance - totalDistance < Horizon)
            {
                float z = nextRowDistance - totalDistance;
                ObstaclePlanner.Row plan = planner.Plan(nextRowDistance, rowNumber, difficulty);
                SpawnHazard(plan.FirstLane, plan.FirstKind, z);
                if (plan.HasSecond) SpawnHazard(plan.SecondLane, plan.SecondKind, z);
                // Every row has a guaranteed safe lane, including cross-lane police cars.
                SpawnCoin(plan.SafeLane, z + 4f);
                // Provisional distribution (not stated in PDF). The reward is *before* the row's hazard.
                int powerRowInterval = Mathf.Max(1, powerConfig.PickupEveryRows);
                if (rowNumber % powerRowInterval == 0)
                    SpawnPower(plan.SafeLane, (PowerKind)((rowNumber / powerRowInterval) % 4), z + 8f);
                rowNumber++;
                nextRowDistance += difficulty.SpacingAt(nextRowDistance);
            }
        }
        private void SpawnHazard(int lane, HazardKind kind, float z)
        {
            Stack<Hazard> pool = hazardPools[(int)kind];
            Hazard hazard = pool.Count > 0 ? pool.Pop() : new Hazard { Object = new GameObject("Hazard") };
            hazard.Object.transform.SetParent(transform, false);
            if (hazard.Model == null) hazard.Object.name = "Hazard - " + kind;
            hazard.Object.transform.position = new Vector3((lane - 1) * config.LaneWidth, 0, z);
            hazard.Object.SetActive(true);
            hazard.Lane = lane; hazard.Kind = kind; hazard.Checked = false;
            // Pooled roots keep their visual children; no Instantiate/Destroy when recycled.
            if (hazard.Model != null)
            {
                hazard.Model.localPosition = Vector3.zero;
                hazards.Add(hazard);
                return;
            }
            var modelRoot = new GameObject("Replaceable hazard art").transform;
            modelRoot.SetParent(hazard.Object.transform, false);
            hazard.Model = modelRoot;
            switch (kind)
            {
                case HazardKind.LowBarrier:
                    GreyboxFactory.Primitive("JUMP", PrimitiveType.Cube, modelRoot, new Vector3(0, .45f, 0),
                        new Vector3(1.5f, .9f, .7f), new Color(1f, .59f, .10f)); break;
                case HazardKind.OverheadBeam:
                    GreyboxFactory.Primitive("SLIDE", PrimitiveType.Cube, modelRoot, new Vector3(0, 1.6f, 0),
                        new Vector3(1.7f, .65f, .9f), new Color(.88f, .25f, .72f));
                    for (int side = -1; side <= 1; side += 2)
                        GreyboxFactory.Primitive("Beam leg", PrimitiveType.Cube, modelRoot, new Vector3(side * 1f, .8f, 0),
                            new Vector3(.15f, 1.6f, .2f), new Color(.88f, .25f, .72f));
                    break;
                case HazardKind.Blocker:
                    GreyboxFactory.Primitive("SWITCH LANE", PrimitiveType.Cube, modelRoot, new Vector3(0, 1f, 0),
                        new Vector3(1.6f, 2f, 1.3f), new Color(.96f, .2f, .19f)); break;
                case HazardKind.SlidingTackle:
                    GreyboxFactory.Primitive("Original fictional defender", PrimitiveType.Capsule, modelRoot,
                        new Vector3(0, .6f, 0), new Vector3(.75f, .65f, 1.5f), new Color(.28f, .52f, .95f));
                    break;
                case HazardKind.PoliceCar:
                    // Fictional, unbranded car crosses from outside edge toward middle lane.
                    GreyboxFactory.Primitive("Fictional patrol car", PrimitiveType.Cube, modelRoot,
                        new Vector3(0, .75f, 0), new Vector3(1.6f, 1.5f, 2.4f), new Color(.32f, .37f, .52f));
                    GreyboxFactory.Primitive("Crossing path warning", PrimitiveType.Cube, modelRoot,
                        new Vector3((1 - lane) * config.LaneWidth * .5f, .02f, -5f),
                        new Vector3(config.LaneWidth + 1.6f, .05f, .8f), new Color(1f, .83f, .08f));
                    break;
                case HazardKind.Drone:
                    GreyboxFactory.Primitive("Original straight-line drone", PrimitiveType.Sphere, modelRoot,
                        new Vector3(0, 1.65f, 0), new Vector3(1.5f, .75f, 1.3f), new Color(.36f, .82f, .92f));
                    break;
                case HazardKind.Train:
                    GreyboxFactory.Primitive("Unbranded fictional train", PrimitiveType.Cube, modelRoot,
                        new Vector3(0, 1.25f, 0), new Vector3(1.95f, 2.5f, 5f), new Color(.32f, .69f, .47f));
                    break;
            }
            // Bright visual warning marker: visible in approach, never a surprise spawn.
            GreyboxFactory.Primitive("Approach warning", PrimitiveType.Cube, modelRoot,
                new Vector3(0, .01f, -5f), new Vector3(1.6f, .05f, 1f), new Color(1f, .85f, .10f));
            hazards.Add(hazard);
        }
        private void SpawnCoin(int lane, float z)
        {
            Pickup coin = pickupPool.Count > 0 ? pickupPool.Pop() : new Pickup { Object = new GameObject("Coin") };
            coin.Object.transform.SetParent(transform, false);
            coin.Object.transform.position = new Vector3((lane - 1) * config.LaneWidth, 1f, z);
            if (coin.Object.transform.childCount == 0)
                GreyboxFactory.Primitive("Original coin marker", PrimitiveType.Cylinder, coin.Object.transform,
                    Vector3.zero, new Vector3(.62f, .08f, .62f), new Color(1f, .84f, .14f));
            coin.Object.SetActive(true);
            coin.Lane = lane; coin.Checked = false;
            pickups.Add(coin);
        }
        private void SpawnPower(int lane, PowerKind kind, float z)
        {
            Stack<PowerPickup> pool = powerPools[(int)kind];
            PowerPickup power = pool.Count > 0 ? pool.Pop() : new PowerPickup { Object = new GameObject("Power-up - " + kind) };
            power.Object.transform.SetParent(transform, false);
            power.Object.transform.position = new Vector3((lane - 1) * config.LaneWidth, 1.1f, z);
            if (power.Object.transform.childCount == 0)
            {
                Color tint = PowerColor(kind);
                GreyboxFactory.Primitive("Original power-up beacon", PrimitiveType.Sphere, power.Object.transform,
                    Vector3.zero, new Vector3(.9f, .9f, .9f), tint);
                GreyboxFactory.Primitive("Glowing plinth", PrimitiveType.Cylinder, power.Object.transform,
                    new Vector3(0, -.8f, 0), new Vector3(1f, .06f, 1f), tint);
            }
            power.Kind = kind;
            power.Checked = false;
            power.Object.SetActive(true);
            powerPickups.Add(power);
        }
        public static Color PowerColor(PowerKind kind)
        {
            switch (kind)
            {
                case PowerKind.Magnet: return new Color(.96f, .34f, .30f);
                case PowerKind.SuperShoes: return new Color(.51f, .94f, .32f);
                case PowerKind.Jetpack: return new Color(.38f, .79f, 1f);
                default: return new Color(1f, .78f, .20f);
            }
        }
        public void Tick(float dt, float speed)
        {
            float travel = speed * dt;
            totalDistance += travel;
            float furthest = float.MinValue;
            foreach (Transform tile in tiles) furthest = Mathf.Max(furthest, tile.position.z);
            foreach (Transform tile in tiles)
            {
                tile.position -= Vector3.forward * travel;
                if (tile.position.z < -TileLength * 1.5f)
                {
                    tile.position = new Vector3(0, 0, furthest + TileLength - travel);
                    furthest = tile.position.z;
                }
            }
            for (int i = hazards.Count - 1; i >= 0; i--)
            {
                Hazard h = hazards[i];
                h.PreviousZ = h.HitZ;
                h.Object.transform.position -= Vector3.forward * travel; // drone remains on its forecast line: no unfair row catch-up
                if (h.Kind == HazardKind.PoliceCar)
                {
                    // Provisional 14m warning crossing; the opposite outside lane stays free.
                    float cross = Mathf.Clamp01((14f - h.Object.transform.position.z) / 14f);
                    h.Object.transform.position = new Vector3(Mathf.Lerp((h.Lane - 1) * config.LaneWidth, 0f, cross),
                        0f, h.Object.transform.position.z);
                }
                // Tackles animate along the lane, and their warning precedes the collision by 5m.
                if (h.Kind == HazardKind.SlidingTackle)
                    h.Model.localPosition = new Vector3(0, 0, h.Object.transform.position.z < 11f && h.Object.transform.position.z > -2f ?
                        -Mathf.Clamp01((11f - h.Object.transform.position.z) / 13f) * 1.2f : 0f);
                if (h.Object.transform.position.z < -retireBehindMetres)
                {
                    hazards.RemoveAt(i); h.Object.SetActive(false); hazardPools[(int)h.Kind].Push(h);
                }
            }
            for (int i = pickups.Count - 1; i >= 0; i--)
            {
                Pickup coin = pickups[i];
                coin.PreviousZ = coin.Object.transform.position.z;
                coin.Object.transform.position -= Vector3.forward * travel;
                coin.Object.transform.Rotate(0, 180f * dt, 0);
                if (coin.Object.transform.position.z < -retireBehindMetres)
                {
                    pickups.RemoveAt(i); coin.Object.SetActive(false); pickupPool.Push(coin);
                }
            }
            for (int i = powerPickups.Count - 1; i >= 0; i--)
            {
                PowerPickup p = powerPickups[i];
                p.PreviousZ = p.Object.transform.position.z;
                p.Object.transform.position -= Vector3.forward * travel;
                p.Object.transform.Rotate(0, 120f * dt, 0);
                if (p.Object.transform.position.z < -retireBehindMetres)
                {
                    powerPickups.RemoveAt(i); p.Object.SetActive(false); powerPools[(int)p.Kind].Push(p);
                }
            }
            PopulateHorizon();
        }
        public void GetReplayActors(List<Transform> output)
        {
            foreach (Transform t in tiles) output.Add(t);
            foreach (Hazard h in hazards) { output.Add(h.Object.transform); output.Add(h.Model); }
            foreach (Pickup p in pickups) output.Add(p.Object.transform);
            foreach (PowerPickup p in powerPickups) output.Add(p.Object.transform);
        }
        public void FillUpcoming(List<UpcomingEvent> output)
        {
            output.Clear();
            for (int i = 0; i < hazards.Count; i++)
            {
                Hazard h = hazards[i];
                if (h.Checked || h.HitZ <= 0f) continue;
                bool doubleTackle = false;
                if (h.Kind == HazardKind.SlidingTackle)
                {
                    for (int j = 0; j < hazards.Count; j++)
                        if (i != j && !hazards[j].Checked && hazards[j].Kind == HazardKind.SlidingTackle &&
                            Mathf.Abs(hazards[j].Object.transform.position.z - h.Object.transform.position.z) < .1f)
                        { doubleTackle = true; if (j < i) break; }
                    if (doubleTackle)
                    {
                        bool alreadyAdded = false;
                        for (int j = 0; j < i; j++)
                            if (hazards[j].Kind == HazardKind.SlidingTackle && !hazards[j].Checked &&
                                Mathf.Abs(hazards[j].Object.transform.position.z - h.Object.transform.position.z) < .1f)
                            { alreadyAdded = true; break; }
                        if (alreadyAdded) continue;
                    }
                }
                string label = doubleTackle ? "DOUBLE TACKLE" : h.Kind.ToString().ToUpperInvariant();
                output.Add(new UpcomingEvent { Distance = h.HitZ, Name = label,
                    Lane = h.Lane, Tint = new Color(1f, .57f, .23f) });
            }
            foreach (PowerPickup p in powerPickups)
                if (!p.Checked && p.Object.transform.position.z > 0)
                    output.Add(new UpcomingEvent { Distance = p.Object.transform.position.z,
                        Name = p.Kind.ToString().ToUpperInvariant(), Lane = -1, Tint = PowerColor(p.Kind) });
            output.Sort((a, b) => a.Distance.CompareTo(b.Distance));
        }
        public void ClearNearPlayerAfterRevive(float currentSpeed)
        {
            // Same distance/world position retained; nearby follow-up hazards suppressed for the 2s grace period.
            foreach (Hazard h in hazards)
                if (h.HitZ < currentSpeed * config.ReviveInvulnerabilitySeconds + 2f)
                    h.Checked = true;
        }
    }
}
