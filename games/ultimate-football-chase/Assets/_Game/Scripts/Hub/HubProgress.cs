using System;
using UnityEngine;

namespace UltimateFootballChase.Hub
{
    /// <summary>Client-side Hub preview, never authority for prizes, wallet or ranked results.</summary>
    [Serializable]
    public sealed class HubProgress
    {
        public int SchemaVersion = 1;
        public int CompletedStages;
        public int FinishedRuns;
        public float BestRunMeters;
        public float LastRunMeters;
        public Vector3 Position = new Vector3(0f, 0f, -3f);
        public string LastDoor = "Central Plaza";
        public string SelectedOutfit = "teal";
        public long LastSavedUtcTicks;
    }

    public interface IHubProgressRepository
    {
        HubProgress Load();
        void Save(HubProgress progress);
    }

    /// <summary>Not tamper resistant, not account-bound. NEVER use for wallets or real-prize competitions.</summary>
    public sealed class LocalGuestHubRepository : IHubProgressRepository
    {
        private const string Key = "ufc.hub.guest.v1";
        public HubProgress Load()
        {
            string json = PlayerPrefs.GetString(Key, string.Empty);
            if (string.IsNullOrEmpty(json)) return new HubProgress();
            try
            {
                var profile = JsonUtility.FromJson<HubProgress>(json);
                return HubProgressSanitizer.Clean(profile) ?? new HubProgress();
            }
            catch (Exception ex)
            {
                Debug.LogWarning("Hub guest save unreadable, restoring default: " + ex.Message);
                return new HubProgress();
            }
        }
        public void Save(HubProgress progress)
        {
            progress.SchemaVersion = 1;
            progress.LastSavedUtcTicks = DateTime.UtcNow.Ticks;
            PlayerPrefs.SetString(Key, JsonUtility.ToJson(progress));
            PlayerPrefs.Save();
        }
    }

    public static class HubProgressSanitizer
    {
        public static HubProgress Clean(HubProgress profile)
        {
            if (profile == null || profile.SchemaVersion != 1) return null;
            profile.CompletedStages = Mathf.Clamp(profile.CompletedStages, 0, 1000);
            profile.FinishedRuns = Mathf.Clamp(profile.FinishedRuns, 0, 1000000);
            profile.BestRunMeters = FiniteDistance(profile.BestRunMeters);
            profile.LastRunMeters = FiniteDistance(profile.LastRunMeters);
            if (float.IsNaN(profile.Position.x) || float.IsNaN(profile.Position.z) ||
                float.IsInfinity(profile.Position.x) || float.IsInfinity(profile.Position.z))
                profile.Position = new Vector3(0f, 0f, -3f);
            profile.Position = new Vector3(Mathf.Clamp(profile.Position.x, -42f, 42f), 0f,
                Mathf.Clamp(profile.Position.z, -16f, 48f));
            if (profile.SelectedOutfit != "teal" && profile.SelectedOutfit != "amber" &&
                profile.SelectedOutfit != "violet") profile.SelectedOutfit = "teal";
            if (string.IsNullOrEmpty(profile.LastDoor) || profile.LastDoor.Length > 80)
                profile.LastDoor = "Central Plaza";
            if (profile.LastSavedUtcTicks < 0 || profile.LastSavedUtcTicks > DateTime.UtcNow.AddDays(1).Ticks)
                profile.LastSavedUtcTicks = 0;
            return profile;
        }
        private static float FiniteDistance(float metres) =>
            float.IsNaN(metres) || float.IsInfinity(metres) ? 0f : Mathf.Clamp(metres, 0f, 1000000f);
    }

    /// <summary>One level per completed run. Distances are explicitly provisional, not PDF-specified.</summary>
    public static class HubStageProgression
    {
        public const int UnlockMarketAndPitchAfterStages = 5; // exact PDF section 5
        public const float ProvisionalMetresPerStage = 250f;
        public static float NextGoal(HubProgress progress) =>
            ProvisionalMetresPerStage * (Mathf.Max(0, progress.CompletedStages) + 1);
        public static bool IsExtendedHubUnlocked(HubProgress progress) =>
            progress.CompletedStages >= UnlockMarketAndPitchAfterStages;
        public static bool TryCompleteNextStage(HubProgress progress, float acceptedRunDistance)
        {
            if (progress == null || float.IsNaN(acceptedRunDistance) ||
                float.IsInfinity(acceptedRunDistance) || acceptedRunDistance < NextGoal(progress)) return false;
            progress.CompletedStages++;
            return true;
        }
    }

    public static class HubGuestProgress
    {
        private static IHubProgressRepository repository = new LocalGuestHubRepository();
        public static void UseRepository(IHubProgressRepository replacement) =>
            repository = replacement ?? throw new ArgumentNullException(nameof(replacement));
        public static HubProgress Load() => repository.Load();
        public static void Save(HubProgress progress) => repository.Save(progress);
        public static bool RecordFinishedRun(float metres, out HubProgress result)
        {
            result = Load();
            if (float.IsNaN(metres) || float.IsInfinity(metres)) metres = 0f;
            metres = Mathf.Max(0f, metres);
            result.FinishedRuns++;
            result.LastRunMeters = metres;
            result.BestRunMeters = Mathf.Max(result.BestRunMeters, metres);
            bool completed = HubStageProgression.TryCompleteNextStage(result, metres);
            Save(result);
            return completed;
        }
    }
}
