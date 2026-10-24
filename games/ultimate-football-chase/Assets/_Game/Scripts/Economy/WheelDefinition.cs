using System;
using System.Security.Cryptography;
using System.Collections.Generic;

namespace UltimateFootballChase.Economy
{
    public enum WheelPrize { Coin50, Coin100, Key1, Coin200, Key3, BasicBox, Key10, Gem5 }

    /// <summary>PDF section 10: exact eight slots, integer percentages totaling 100.</summary>
    public static class WheelDefinition
    {
        public static readonly IReadOnlyList<int> Weights = Array.AsReadOnly(new[] { 25, 20, 20, 15, 10, 5, 3, 2 });
        public static readonly IReadOnlyList<string> Labels = Array.AsReadOnly(new[] {
            "50 Coins", "100 Coins", "1 Key", "200 Coins", "3 Keys",
            "Basic Box", "10 Keys (jackpot)", "5 Gems"
        });
        public static WheelPrize ResultForRoll(int roll)
        {
            if (roll < 0 || roll >= 100) throw new ArgumentOutOfRangeException(nameof(roll));
            int threshold = 0;
            for (int i = 0; i < Weights.Count; i++)
            {
                threshold += Weights[i];
                if (roll < threshold) return (WheelPrize)i;
            }
            throw new InvalidOperationException("Wheel percentages must sum to 100");
        }
        public static int SecureDemoRoll()
        {
            // Exact uniform 0..99 via rejection sampling; still NOT server-authoritative.
            using (var random = RandomNumberGenerator.Create())
            {
                var sample = new byte[1];
                do { random.GetBytes(sample); } while (sample[0] >= 200);
                return sample[0] % 100;
            }
        }
        public static long UtcDay(DateTime utc)
        {
            if (utc.Kind != DateTimeKind.Utc) throw new ArgumentException("UTC time required", nameof(utc));
            return utc.Year * 10000L + utc.Month * 100L + utc.Day;
        }
    }
}
