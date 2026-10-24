using System;
using System.Threading.Tasks;

namespace UltimateFootballChase.Ads
{
    public enum RewardedPlacement { FreeRevive, ExtraWheelSpin, ExtraChest, DoubleRunCoins, StoreCoins }

    /// <summary>Pure scheduling policy: an interstitial is only eligible BETWEEN attempts, never mid-run.</summary>
    public sealed class InterstitialPacer
    {
        public const int ProvisionalAttemptsBetweenAds = 4; // PDF: once every 3–4 attempts
        public int CompletedAttemptsSinceShown { get; private set; }
        public void OnCompletedAttempt()
        {
            if (CompletedAttemptsSinceShown < 1000000) CompletedAttemptsSinceShown++;
        }
        public bool CanShow(bool betweenAttempts, bool verifiedRemoveAdsEntitlement,
            bool sdkReady, bool rewardedAdInProgress) =>
            betweenAttempts && !verifiedRemoveAdsEntitlement && sdkReady && !rewardedAdInProgress &&
            CompletedAttemptsSinceShown >= ProvisionalAttemptsBetweenAds;
        public void OnActuallyShown(bool sdkConfirmedPresentation)
        {
            // A request or unavailable SDK never consumes the cap.
            if (sdkConfirmedPresentation) CompletedAttemptsSinceShown = 0;
        }
    }

    public interface IAdGateway
    {
        bool IsConfigured { get; }
        // An SDK callback alone is NOT a server-verified reward receipt.
        Task<string> ShowRewardedAsync(RewardedPlacement placement);
        Task<bool> ShowInterstitialAsync();
    }
    public interface IRewardVerificationGateway
    {
        // Future account-only server endpoint validates a network-specific signed callback
        // and atomically applies the reward ONCE. No client-provided payout amount.
        Task<bool> ConfirmRewardAsync(RewardedPlacement placement, string networkReceiptId);
    }
    public sealed class UnavailableAdGateway : IAdGateway
    {
        public bool IsConfigured => false;
        public Task<string> ShowRewardedAsync(RewardedPlacement placement) =>
            Task.FromException<string>(new NotSupportedException("Ad SDK unavailable; no rewarded ad was watched"));
        public Task<bool> ShowInterstitialAsync() => Task.FromResult(false);
    }
    public sealed class UnavailableRewardVerificationGateway : IRewardVerificationGateway
    {
        public Task<bool> ConfirmRewardAsync(RewardedPlacement placement, string id) =>
            Task.FromException<bool>(new NotSupportedException("No server-verified reward ledger is configured"));
    }

    /// <summary>Informational math ONLY. Server must count distinct verified ad events per UTC day.</summary>
    public static class RewardedStreakPolicy
    {
        public const int AdsPerBonus = 5;
        public const int CoinsPerBonus = 50; // exact PDF section 10
        public static bool WouldAwardBonus(int verifiedAdsToday) =>
            verifiedAdsToday > 0 && verifiedAdsToday % AdsPerBonus == 0;
    }
}
