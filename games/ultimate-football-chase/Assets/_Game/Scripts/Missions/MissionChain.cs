using System;

namespace UltimateFootballChase.Missions
{
    /// <summary>Untrusted gameplay checklist; NEVER an authoritative score or purchasable reward.</summary>
    [Serializable]
    public sealed class MissionChainSnapshot
    {
        public int CompletedGroups;
        public int Jumps;
        public int AvoidedTackles;
        public int Coins;
    }

    public sealed class MissionChain
    {
        public const int MaxMultiplier = 30; // exact design-document cap
        public const int JumpGoal = 15; // examples in design document; grouping is provisional
        public const int AvoidGoal = 10;
        public const int CoinGoal = 100;
        private readonly MissionChainSnapshot state;
        public MissionChain(MissionChainSnapshot saved = null)
        {
            state = new MissionChainSnapshot {
                CompletedGroups = Clamp(saved == null ? 0 : saved.CompletedGroups, 0, MaxMultiplier - 1),
                Jumps = Clamp(saved == null ? 0 : saved.Jumps, 0, JumpGoal),
                AvoidedTackles = Clamp(saved == null ? 0 : saved.AvoidedTackles, 0, AvoidGoal),
                Coins = Clamp(saved == null ? 0 : saved.Coins, 0, CoinGoal)
            };
            if (state.CompletedGroups == MaxMultiplier - 1)
                state.Jumps = state.AvoidedTackles = state.Coins = 0;
        }
        public int Multiplier => Math.Min(MaxMultiplier, 1 + state.CompletedGroups);
        public int Group => state.CompletedGroups;
        public int Jumps => state.Jumps;
        public int AvoidedTackles => state.AvoidedTackles;
        public int Coins => state.Coins;
        public MissionChainSnapshot Snapshot() => new MissionChainSnapshot {
            CompletedGroups = state.CompletedGroups, Jumps = state.Jumps,
            AvoidedTackles = state.AvoidedTackles, Coins = state.Coins
        };
        public void Jump() { if (Multiplier < MaxMultiplier) { state.Jumps = Math.Min(JumpGoal, state.Jumps + 1); Advance(); } }
        public void AvoidTackle() { if (Multiplier < MaxMultiplier) { state.AvoidedTackles = Math.Min(AvoidGoal, state.AvoidedTackles + 1); Advance(); } }
        public void CollectCoin() { if (Multiplier < MaxMultiplier) { state.Coins = Math.Min(CoinGoal, state.Coins + 1); Advance(); } }
        private void Advance()
        {
            if (state.Jumps < JumpGoal || state.AvoidedTackles < AvoidGoal || state.Coins < CoinGoal) return;
            state.CompletedGroups++;
            state.Jumps = state.AvoidedTackles = state.Coins = 0;
        }
        private static int Clamp(int value, int min, int max) => Math.Max(min, Math.Min(max, value));
    }
}
