using System;
using System.Threading.Tasks;
using UnityEngine;

namespace UltimateFootballChase.Ads
{
    /// <summary>Default ad gateway is unavailable. No ad, proof or reward is fabricated.</summary>
    public sealed class AdSession : MonoBehaviour
    {
        public static AdSession Instance { get; private set; }
        private readonly InterstitialPacer pacer = new InterstitialPacer();
        private IAdGateway gateway;
        private bool showing;
        public static AdSession Ensure() => Instance != null ? Instance :
            new GameObject("Ads — unavailable without SDK").AddComponent<AdSession>();
        private void Awake()
        {
            if (Instance != null && Instance != this) { Destroy(gameObject); return; }
            Instance = this;
            DontDestroyOnLoad(gameObject);
            gateway = new UnavailableAdGateway();
        }
        private void OnDestroy() { if (Instance == this) Instance = null; }
        public void FinishedAttempt() => pacer.OnCompletedAttempt();
        public async Task TryInterstitialBetweenAttemptsAsync(bool verifiedRemoveAdsEntitlement)
        {
            if (showing || !pacer.CanShow(true, verifiedRemoveAdsEntitlement,
                gateway.IsConfigured, false)) return;
            showing = true;
            try
            {
                bool presented = await gateway.ShowInterstitialAsync();
                pacer.OnActuallyShown(presented); // never reset on load failure/unavailable SDK
            }
            catch (Exception ex) { Debug.LogWarning("Interstitial unavailable: " + ex.Message); }
            finally { showing = false; }
        }
    }
}
