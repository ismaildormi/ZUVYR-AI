#if UFC_FIREBASE
using System;
using System.Threading.Tasks;
using Firebase;
using Firebase.Firestore;
using UnityEngine;

namespace UltimateFootballChase.Showdown
{
    internal sealed class FirebaseShowdownGateway : IShowdownGateway
    {
        public bool IsConfigured => true;
        public async Task<ShowdownEventView> FetchScheduleAsync()
        {
            if (await FirebaseApp.CheckAndFixDependenciesAsync() != DependencyStatus.Available)
                throw new InvalidOperationException("Firebase unavailable");
            var snap = await FirebaseFirestore.DefaultInstance.Collection("eventViews")
                .Document("showdown_current").GetSnapshotAsync(Source.Server);
            if (!snap.Exists || snap.GetValue<long>("schema") != 1)
                throw new InvalidOperationException("No published Showdown event");
            string payload = snap.GetValue<string>("payload");
            if (string.IsNullOrEmpty(payload) || payload.Length > 4096)
                throw new InvalidOperationException("Invalid Showdown event");
            return JsonUtility.FromJson<ShowdownEventView>(payload);
        }
    }
}
#endif
