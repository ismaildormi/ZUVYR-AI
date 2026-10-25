using System; using NUnit.Framework; using Velox.Leaderboard;
namespace Velox.Tests
{
    public sealed class MonthlyPeriodTests
    {
        [Test] public void PeriodId_IsYearMonth(){ Assert.AreEqual("2026-10", MonthlyPeriod.CurrentId(new DateTime(2026,10,25,12,0,0,DateTimeKind.Utc))); }
        [Test] public void NextReset_IsFirstOfNextMonth(){ Assert.AreEqual(new DateTime(2026,11,1,0,0,0,DateTimeKind.Utc), MonthlyPeriod.NextResetUtc(new DateTime(2026,10,25,0,0,0,DateTimeKind.Utc))); }
        [Test] public void December_RollsToJanuary(){ Assert.AreEqual(new DateTime(2027,1,1,0,0,0,DateTimeKind.Utc), MonthlyPeriod.NextResetUtc(new DateTime(2026,12,31,23,59,59,DateTimeKind.Utc))); }
        [Test] public void NewPeriod_Detected(){ Assert.IsTrue(MonthlyPeriod.IsNewPeriod("2026-09", new DateTime(2026,10,1,0,0,0,DateTimeKind.Utc))); Assert.IsFalse(MonthlyPeriod.IsNewPeriod("2026-10", new DateTime(2026,10,2,0,0,0,DateTimeKind.Utc))); }
    }
}
