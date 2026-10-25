using UnityEngine;

namespace VELOX.Core
{
    /// <summary>
    /// Lightweight static service locator. Lets scene-scoped systems reach the
    /// long-lived singletons (<see cref="GameDirector"/>,
    /// <see cref="Backend.AccountSession"/>) without passing references around.
    /// </summary>
    public static class ServiceLocator
    {
        public static GameDirector GameDirector { get; set; }
        public static Backend.AccountSession AccountSession { get; set; }
        public static UI.LeaderboardManager LeaderboardManager { get; set; }
        public static UI.GameUI GameUI { get; set; }
        public static GameEvents Events { get; set; }

        /// <summary>True once the boot systems have been registered.</summary>
        public static bool IsReady =>
            GameDirector != null && AccountSession != null;

        public static void Register(
            GameDirector director,
            Backend.AccountSession accountSession,
            UI.LeaderboardManager leaderboard,
            UI.GameUI ui,
            GameEvents ev)
        {
            GameDirector = director;
            AccountSession = accountSession;
            LeaderboardManager = leaderboard;
            GameUI = ui;
            Events = ev;
        }

        public static void Unregister()
        {
            GameDirector = null;
            AccountSession = null;
            LeaderboardManager = null;
            GameUI = null;
            Events = null;
        }
    }
}
