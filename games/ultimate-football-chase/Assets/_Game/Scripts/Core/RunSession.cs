using System;

namespace UltimateFootballChase.Core
{
    /// <summary>Offline phase-1 test session, NOT a wallet or trusted/validated score.</summary>
    public sealed class RunSession
    {
        public string RunId { get; } = Guid.NewGuid().ToString("N");
        public float DistanceMeters { get; private set; }
        public int Coins { get; private set; }
        public int Keys { get; private set; }
        public int Revives { get; private set; }
        public int NextReviveCost(int maximum) => Math.Min(maximum, 1 << Math.Min(Revives, 2));

        public RunSession(int testKeys) { Keys = Math.Max(0, testKeys); }
        public void Advance(float meters) { DistanceMeters += Math.Max(0f, meters); }
        public void CollectCoin() { if (Coins < 1000000) Coins++; }
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
