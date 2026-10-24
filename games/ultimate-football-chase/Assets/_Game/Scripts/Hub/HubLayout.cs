using System;
using UnityEngine;

namespace UltimateFootballChase.Hub
{
    public enum HubZone { Home, CentralPlaza, PracticePitch, Market }

    /// <summary>Fixed authored layout; not procedural. Coordinates are provisional art/layout settings.</summary>
    public static class HubLayout
    {
        public static Vector3 Centre(HubZone zone)
        {
            switch (zone)
            {
                case HubZone.Home: return new Vector3(-24, 0, 0);
                case HubZone.PracticePitch: return new Vector3(0, 0, 32);
                case HubZone.Market: return new Vector3(24, 0, 0);
                default: return Vector3.zero;
            }
        }
        public static bool CanWalk(Vector3 point, bool unlocked)
        {
            float x = point.x, z = point.z;
            bool plaza = Mathf.Abs(x) <= 12f && z >= -12f && z <= 14f;
            bool home = x >= -39f && x <= -12f && Mathf.Abs(z) <= 12f;
            bool homePassage = x >= -24f && x <= 0f && Mathf.Abs(z) <= 4f;
            bool market = x >= 16f && x <= 40f && Mathf.Abs(z) <= 12f;
            bool marketPassage = x >= 0f && x <= 24f && Mathf.Abs(z) <= 4f;
            bool pitch = Mathf.Abs(x) <= 14f && z >= 20f && z <= 46f;
            bool pitchPassage = Mathf.Abs(x) <= 4f && z >= 0f && z <= 32f;
            return plaza || home || homePassage ||
                (unlocked && (market || marketPassage || pitch || pitchPassage));
        }
        public static HubZone ZoneAt(Vector3 point)
        {
            if (point.x < -14f && Mathf.Abs(point.z) <= 13f) return HubZone.Home;
            if (point.x > 14f && Mathf.Abs(point.z) <= 13f) return HubZone.Market;
            if (point.z >= 17f && Mathf.Abs(point.x) < 15f) return HubZone.PracticePitch;
            return HubZone.CentralPlaza;
        }
        public static bool IsDay(int localHour) => localHour >= 6 && localHour < 19; // provisional daylight window
        public static int SeasonAt(DateTime utc, int cycleMonths = 3)
        {
            int months = Mathf.Clamp(cycleMonths, 2, 3);
            return ((utc.Year * 12 + utc.Month - 1) / months) % 4;
        }
    }
}
