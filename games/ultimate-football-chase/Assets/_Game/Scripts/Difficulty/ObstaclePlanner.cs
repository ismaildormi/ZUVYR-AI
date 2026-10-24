using System;
using UltimateFootballChase.Gameplay;

namespace UltimateFootballChase.Difficulty
{
    /// <summary>A full row is planned before spawning. At least one lane is always clear at impact.</summary>
    public sealed class ObstaclePlanner
    {
        private readonly Random random;
        private int pendingSlideLane = -1;
        public ObstaclePlanner(int seed) { random = new Random(seed); }
        public void Reset() { pendingSlideLane = -1; }

        public struct Row
        {
            public HazardKind FirstKind;
            public int FirstLane;
            public bool HasSecond;
            public HazardKind SecondKind;
            public int SecondLane;
            public int SafeLane;
            public int OccupiedMask => (1 << FirstLane) | (HasSecond ? 1 << SecondLane : 0)
                | (FirstKind == HazardKind.PoliceCar ? 1 << 1 : 0); // car crosses into centre
        }

        public Row Plan(float distanceMetres, int rowIndex, DifficultyProfile difficulty)
        {
            int tier = difficulty.TierAt(distanceMetres);
            int lane = random.Next(3);
            var row = new Row { FirstLane = lane };
            if (pendingSlideLane >= 0)
            {
                row.FirstLane = pendingSlideLane;
                row.FirstKind = HazardKind.OverheadBeam;
                pendingSlideLane = -1;
            }
            else if (tier == 0)
            {
                // Training: simple barriers only. No tacklers, police cars or drones before 250m.
                row.FirstKind = rowIndex % 2 == 0 ? HazardKind.LowBarrier : HazardKind.Blocker;
            }
            else if (tier == 1)
            {
                // Provisional low-frequency (every sixth row) single tackle, never double.
                row.FirstKind = rowIndex % 6 == 0 ? HazardKind.SlidingTackle :
                    rowIndex % 2 == 0 ? HazardKind.LowBarrier : HazardKind.OverheadBeam;
            }
            else if (tier == 2)
            {
                // Provisional repeating sequence: low barrier then overhead beam on next row.
                if (rowIndex % 5 == 0)
                {
                    row.FirstKind = HazardKind.LowBarrier;
                    pendingSlideLane = lane;
                }
                else row.FirstKind = rowIndex % 4 == 0 ? HazardKind.Train :
                    rowIndex % 3 == 0 ? HazardKind.SlidingTackle : HazardKind.Blocker;
            }
            else
            {
                // Highest tier: double tackles on two lanes, cross-lane police, straight drones.
                if (rowIndex % 7 == 0)
                {
                    row.FirstKind = HazardKind.SlidingTackle;
                    row.HasSecond = true;
                    row.SecondKind = HazardKind.SlidingTackle;
                    row.SecondLane = (lane + 1) % 3;
                }
                else if (rowIndex % 5 == 0)
                {
                    row.FirstKind = HazardKind.PoliceCar;
                    row.FirstLane = random.Next(2) == 0 ? 0 : 2;
                }
                else if (rowIndex % 3 == 0) row.FirstKind = HazardKind.Drone;
                else row.FirstKind = rowIndex % 2 == 0 ? HazardKind.SlidingTackle : HazardKind.Blocker;
            }
            int safeCount = 0;
            for (int candidate = 0; candidate < 3; candidate++)
                if ((row.OccupiedMask & (1 << candidate)) == 0) safeCount++;
            if (safeCount == 0) throw new InvalidOperationException("Unfair obstacle row: no safe lane");
            // Pick a guaranteed-clear lane for a coin; always choose one deterministically.
            int offset = random.Next(3);
            for (int i = 0; i < 3; i++)
            {
                int candidate = (offset + i) % 3;
                if ((row.OccupiedMask & (1 << candidate)) != 0) continue;
                row.SafeLane = candidate;
                break;
            }
            return row;
        }
    }
}
