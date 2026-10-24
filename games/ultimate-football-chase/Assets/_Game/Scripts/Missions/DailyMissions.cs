using System;
using UnityEngine;
using UltimateFootballChase.Hub;
using UltimateFootballChase.Settings;

namespace UltimateFootballChase.Missions
{
    /// <summary>Local/account preview checklists only: no prizes, server authority or spendable balances.</summary>
    public static class DailyMissions
    {
        public const int RunGoal = 1;
        public const int CoinGoal = 20;
        public const int DistanceGoal = 500;
        public static long UtcDay(DateTime utc) => utc.ToUniversalTime().Date.Ticks;
        public static void RecordRun(HubProgress profile, DateTime utc, float metres, int coins)
        {
            long day = UtcDay(utc);
            if (profile.MissionUtcDayTicks != day)
            {
                profile.MissionUtcDayTicks = day;
                profile.MissionRuns = profile.MissionCoins = profile.MissionDistanceMetres = 0;
            }
            profile.MissionRuns = Mathf.Min(10000, profile.MissionRuns + 1);
            profile.MissionCoins = Mathf.Min(1000000, profile.MissionCoins + Mathf.Clamp(coins, 0, 1000000));
            if (!float.IsNaN(metres) && !float.IsInfinity(metres))
                profile.MissionDistanceMetres = Mathf.Min(1000000, profile.MissionDistanceMetres + Mathf.Clamp(metres, 0, 1000000));
        }
        public static string Status(HubProgress profile, DateTime utc, string language = "en")
        {
            bool today = profile.MissionUtcDayTicks == UtcDay(utc);
            int runs = today ? profile.MissionRuns : 0;
            int coins = today ? profile.MissionCoins : 0;
            int metres = today ? Mathf.FloorToInt(profile.MissionDistanceMetres) : 0;
            return GameText.Get("dailyChecklist", language) + "\n" +
                GameText.Get("completeRun", language) + ": " + Mathf.Min(runs, RunGoal) + "/" + RunGoal + "\n" +
                GameText.Get("collectCoins", language) + ": " + Mathf.Min(coins, CoinGoal) + "/" + CoinGoal + "\n" +
                GameText.Get("travel", language) + ": " + Mathf.Min(metres, DistanceGoal) + "/" + DistanceGoal + "m" +
                "\n" + GameText.Get("noRewards", language);
        }
    }
}
