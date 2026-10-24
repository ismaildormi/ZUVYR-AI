using System;
using UnityEngine;
using UltimateFootballChase.Hub;

namespace UltimateFootballChase.Seasons
{
    /// <summary>Four original reusable run-route themes; visuals only, no paid event or challenge result.</summary>
    public static class RunnerSeasons
    {
        public static readonly string[] Names = { "Bloom", "Solar", "Amber", "Frost" };
        private static readonly Color[] Road = {
            new Color(.13f,.18f,.23f), new Color(.20f,.18f,.24f),
            new Color(.21f,.18f,.16f), new Color(.14f,.18f,.26f)
        };
        private static readonly Color[] Lane = {
            new Color(.23f,.37f,.33f), new Color(.30f,.33f,.27f),
            new Color(.33f,.28f,.24f), new Color(.22f,.34f,.41f)
        };
        private static readonly Color[] Accent = {
            new Color(.85f,.47f,.75f), new Color(.97f,.76f,.25f),
            new Color(.92f,.46f,.29f), new Color(.54f,.84f,.97f)
        };
        public static int At(DateTime utc, int cycleMonths = 3) => HubLayout.SeasonAt(utc, cycleMonths);
        public static Color Asphalt(int index) => Road[Mathf.Clamp(index, 0, 3)];
        public static Color LaneMark(int index) => Lane[Mathf.Clamp(index, 0, 3)];
        public static Color Decor(int index) => Accent[Mathf.Clamp(index, 0, 3)];
    }
}
