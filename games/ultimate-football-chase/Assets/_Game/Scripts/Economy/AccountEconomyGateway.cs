using System;
using System.Threading.Tasks;

namespace UltimateFootballChase.Economy
{
    /// <summary>Future server-issued view; never deserialize a client PlayerPrefs/Hub field as this type.</summary>
    public sealed class VerifiedWalletView
    {
        public readonly long Coins, Gems;
        public readonly string[] EntitlementIds;
        public VerifiedWalletView(long coins, long gems, string[] entitlementIds)
        {
            Coins = coins; Gems = gems; EntitlementIds = entitlementIds ?? Array.Empty<string>();
        }
    }
    public interface IAccountEconomyGateway
    {
        // A future trusted server owns the ledger and validates account, run events and receipts.
        // No client method can grant a score/coin/gem amount or accept a self-declared IAP receipt.
        Task<VerifiedWalletView> LoadAsync();
        Task<VerifiedWalletView> BuyWithCoinsAsync(string catalogItemId, string idempotencyKey);
        Task<VerifiedWalletView> RestoreStorePurchasesAsync();
    }
    public sealed class UnavailableAccountEconomyGateway : IAccountEconomyGateway
    {
        private static Exception Missing() => new NotSupportedException(
            "Account wallet/IAP unavailable: server ledger, store SDK and verified receipts are not configured.");
        public Task<VerifiedWalletView> LoadAsync() => Task.FromException<VerifiedWalletView>(Missing());
        public Task<VerifiedWalletView> BuyWithCoinsAsync(string id, string key) =>
            Task.FromException<VerifiedWalletView>(Missing());
        public Task<VerifiedWalletView> RestoreStorePurchasesAsync() =>
            Task.FromException<VerifiedWalletView>(Missing());
    }
}
