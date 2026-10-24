using System;
using System.Threading;
using System.Threading.Tasks;

namespace UltimateFootballChase.Rankings
{
    public sealed class BoardLoadResult
    {
        public readonly LeaderboardSnapshot Snapshot;
        public readonly string Status;
        public BoardLoadResult(LeaderboardSnapshot snapshot, string status)
        {
            Snapshot = snapshot;
            Status = status;
        }
    }
    public sealed class LeaderboardService
    {
        private readonly ILeaderboardGateway gateway;
        private readonly int timeoutMs;
        public LeaderboardService(ILeaderboardGateway source, int timeoutMilliseconds = 12000)
        {
            gateway = source ?? throw new ArgumentNullException(nameof(source));
            if (timeoutMilliseconds < 1) throw new ArgumentOutOfRangeException(nameof(timeoutMilliseconds));
            timeoutMs = timeoutMilliseconds;
        }
        public async Task<BoardLoadResult> LoadAsync(BoardKind kind)
        {
            // Validating requested kind is independent of network configuration.
            LeaderboardPolicy.DocumentId(kind);
            if (!gateway.IsConfigured)
                return new BoardLoadResult(null, "UNAVAILABLE • no server-published leaderboard configured");
            try
            {
                Task<LeaderboardSnapshot> operation = gateway.FetchServerPublishedAsync(kind);
                if (await Task.WhenAny(operation, Task.Delay(timeoutMs)) != operation)
                {
                    operation.ContinueWith(t => { var ignored = t.Exception; },
                        CancellationToken.None, TaskContinuationOptions.OnlyOnFaulted, TaskScheduler.Default);
                    return new BoardLoadResult(null, "UNAVAILABLE • server leaderboard timed out");
                }
                LeaderboardSnapshot fetched = await operation;
                if (!LeaderboardPolicy.IsValid(fetched, kind))
                    return new BoardLoadResult(null, "UNAVAILABLE • server snapshot invalid or unpublished");
                return new BoardLoadResult(LeaderboardPolicy.Copy(fetched), "SERVER-PUBLISHED • not a prize decision");
            }
            catch (Exception)
            {
                // Do not surface stale local progress, fake rows or raw backend exceptions/identifiers.
                return new BoardLoadResult(null, "UNAVAILABLE • no verified server standings available");
            }
        }
    }
}
