#if UFC_FIREBASE
using System;
using System.Threading.Tasks;
using Firebase;
using Firebase.Firestore;
using UnityEngine;

namespace UltimateFootballChase.Rankings
{
    /// <summary>
    /// Public READ of an Admin-published Firestore view only. Never read hubPreviews,
    /// infer rank from local runs, or write to leaderboardViews from the Unity client.
    /// </summary>
    internal sealed class FirebaseLeaderboardGateway : ILeaderboardGateway
    {
        public bool IsConfigured => true; // SDK compiled; dependency/project errors are reported on fetch.
        public async Task<LeaderboardSnapshot> FetchServerPublishedAsync(BoardKind kind)
        {
            string docId = LeaderboardPolicy.DocumentId(kind); // whitelist; no arbitrary path input
            if (await FirebaseApp.CheckAndFixDependenciesAsync() != DependencyStatus.Available)
                throw new InvalidOperationException("Firebase dependencies unavailable");
            var doc = FirebaseFirestore.DefaultInstance.Collection("leaderboardViews").Document(docId);
            DocumentSnapshot response = await doc.GetSnapshotAsync(Source.Server);
            if (!response.Exists || response.GetValue<long>("schema") != 1)
                throw new InvalidOperationException("No server leaderboard snapshot published");
            string payload = response.GetValue<string>("payload");
            if (string.IsNullOrEmpty(payload) || payload.Length > 8192)
                throw new InvalidOperationException("Invalid server snapshot payload");
            // Validation continues in LeaderboardService. Firestore rules deny all client writes.
            return JsonUtility.FromJson<LeaderboardSnapshot>(payload);
        }
    }
}
#endif
