using System;
using System.Threading.Tasks;
using UnityEngine;

namespace UltimateFootballChase.Showdown
{
    [Serializable]
    public sealed class ShowdownEventView
    {
        public int SchemaVersion = 1;
        public string EventId;
        public string Title;
        public long StartsUtcTicks;
        public long EndsUtcTicks;
        public string Status; // scheduled, live, closed, review
        public int ParticipantCount; // server-produced informational value only
    }

    /// <summary>Public schedule only. Real async opponents/results/unlocks require validated server games.</summary>
    public static class ShowdownPolicy
    {
        public static bool IsValid(ShowdownEventView value)
        {
            if (value == null || value.SchemaVersion != 1 || string.IsNullOrEmpty(value.EventId) ||
                value.EventId.Length > 48 || string.IsNullOrWhiteSpace(value.Title) || value.Title.Length > 60 ||
                value.ParticipantCount < 0 || value.ParticipantCount > 10000000 ||
                value.StartsUtcTicks < DateTime.MinValue.Ticks || value.EndsUtcTicks > DateTime.MaxValue.Ticks ||
                value.EndsUtcTicks <= value.StartsUtcTicks ||
                value.EndsUtcTicks - value.StartsUtcTicks < TimeSpan.FromDays(3).Ticks ||
                value.EndsUtcTicks - value.StartsUtcTicks > TimeSpan.FromDays(5).Ticks ||
                (value.Status != "scheduled" && value.Status != "live" &&
                 value.Status != "closed" && value.Status != "review")) return false;
            foreach (char c in value.EventId)
                if (!((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-' || c == '_')) return false;
            foreach (char c in value.Title)
                if (char.IsControl(c) || c == '<' || c == '>') return false;
            return true;
        }
    }
    public interface IShowdownGateway
    {
        bool IsConfigured { get; }
        Task<ShowdownEventView> FetchScheduleAsync();
        // No entry/result/unlock write method until a server-verified challenge flow exists.
    }
    public sealed class UnavailableShowdownGateway : IShowdownGateway
    {
        public bool IsConfigured => false;
        public Task<ShowdownEventView> FetchScheduleAsync() => Task.FromException<ShowdownEventView>(
            new NotSupportedException("Server-managed Showdown is not configured"));
    }
    public static class ShowdownGatewayFactory
    {
        public static IShowdownGateway Create()
        {
#if UFC_FIREBASE
            return new FirebaseShowdownGateway();
#else
            return new UnavailableShowdownGateway();
#endif
        }
    }
    public sealed class ShowdownService
    {
        private readonly IShowdownGateway gateway;
        public ShowdownService(IShowdownGateway source) { gateway = source ?? throw new ArgumentNullException(nameof(source)); }
        public async Task<string> PublicStatusAsync()
        {
            if (!gateway.IsConfigured) return "SHOWDOWN UNAVAILABLE: no server event or verified opponents.";
            try
            {
                Task<ShowdownEventView> task = gateway.FetchScheduleAsync();
                if (await Task.WhenAny(task, Task.Delay(12000)) != task)
                {
                    _ = task.ContinueWith(t => { var ignored = t.Exception; },
                        TaskContinuationOptions.OnlyOnFaulted);
                    return "SHOWDOWN UNAVAILABLE: server read timed out.";
                }
                ShowdownEventView view = await task;
                if (!ShowdownPolicy.IsValid(view)) return "SHOWDOWN UNAVAILABLE: no valid published event.";
                return view.Title + " • " + view.Status.ToUpperInvariant() + "\n" +
                    new DateTime(view.StartsUtcTicks, DateTimeKind.Utc).ToString("yyyy-MM-dd") + " to " +
                    new DateTime(view.EndsUtcTicks, DateTimeKind.Utc).ToString("yyyy-MM-dd") + " UTC\n" +
                    "Server schedule only. Entry, opponents and exclusive unlocks are disabled.";
            }
            catch (Exception) { return "SHOWDOWN UNAVAILABLE: server schedule could not be verified."; }
        }
    }
}
