using System;
using UnityEngine;

namespace VELOX.Backend
{
    /// <summary>
    /// Runtime Firebase configuration. Fill these in the Inspector or load them
    /// from a remote config. Never hard-code production secrets in source.
    /// </summary>
    [Serializable]
    public class FirebaseConfig
    {
        /// <summary>Firebase Web API key (safe to embed; not a service-account secret).</summary>
        public string webApiKey = string.Empty;

        /// <summary>Firebase / GCP project id, e.g. "velox-prod".</summary>
        public string projectId = string.Empty;

        /// <summary>OAuth request URI registered in Google Cloud Console.</summary>
        public string requestUri = "https://velox.example.com";

        /// <summary>Realtime Database root, e.g. "https://velox-prod.firebaseio.com".</summary>
        public string databaseUrl = string.Empty;

        /// <summary>
        /// Secured Cloud Function HTTPS endpoint that rolls the monthly
        /// competition over (server-authoritative). The client never resets
        /// global standings directly.
        /// </summary>
        public string monthlyResetEndpoint = string.Empty;

        /// <summary>
        /// Secured Cloud Function HTTPS endpoint that submits a score
        /// (server-authoritative). The client POSTs its name/score with a
        /// Firebase ID token; the function verifies the caller, computes the
        /// period, validates, and writes via the admin SDK. Clients never write
        /// to the Realtime Database directly.
        /// </summary>
        public string submitScoreEndpoint = string.Empty;

        /// <summary>
        /// HTTPS Cloud Function (admin-gated) that finalizes a month: snapshots
        /// the official Top-10 into an immutable node and freezes ranking for
        /// giveaway verification.
        /// </summary>
        public string finalizeEndpoint = string.Empty;

        /// <summary>Disable all remote calls (offline / QA mode).</summary>
        public bool enabled = true;

        [ContextMenu("Validate")]
        public bool IsValid(out string reason)
        {
            if (string.IsNullOrEmpty(webApiKey)) { reason = "Missing webApiKey."; return false; }
            if (string.IsNullOrEmpty(projectId)) { reason = "Missing projectId."; return false; }
            if (string.IsNullOrEmpty(databaseUrl)) { reason = "Missing databaseUrl."; return false; }
            reason = string.Empty;
            return true;
        }
    }
}
