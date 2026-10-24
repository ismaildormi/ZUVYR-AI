using System;
using UltimateFootballChase.Missions;

namespace UltimateFootballChase.Core
{
    /// <summary>Offline phase-1 test session, NOT a wallet or trusted/validated score.</summary>
    public sealed class RunSession
    {
        public string RunId { get; } = Guid.NewGuid().ToString("N");
        public MissionChain Missions { get; private set; }
        // Provisional LOCAL display score. Not uploaded, persisted as rank, or accepted for prizes.
        public long PreviewScore => Math.Min(1000000000L,
            ((long)Math.Floor(Math.Min(1000000f, DistanceMeters)) + Coins * 10L) * Missions.Multiplier);
        public float DistanceMeters { get; private set; }
        public int Coins { get; private set; }
        public int Keys { get; private set; }
        public int Revives { get; private set; }
        public int NextReviveCost(int maximum) => Math.Min(maximum, 1 << Math.Min(Revives, 2));

        public RunSession(int testKeys, MissionChainSnapshot missions = null)
        { Keys = Math.Max(0, testKeys); Missions = new MissionChain(missions); }
        public void RestoreMissionsBeforeRun(MissionChainSnapshot saved)
        {
            if (DistanceMeters > 0 || Coins > 0) return;
            Missions = new MissionChain(saved);
        }
        public void Jump() => Missions.Jump();
        public void AvoidTackle() => Missions.AvoidTackle();
        public void Advance(float meters)
        {
            if (float.IsNaN(meters) || float.IsInfinity(meters) || meters <= 0f) return;
            DistanceMeters = Math.Min(1000000f, DistanceMeters + meters);
        }
        public void CollectCoin()
        {
            if (Coins >= 1000000) return;
            Coins++;
            Missions.CollectCoin();
        }
        public bool TrySpendRevive(int maximum)
        {
            int cost = NextReviveCost(maximum);
            if (Keys < cost) return false;
            Keys -= cost;
            Revives++;
            return true;
        }
    }
}
