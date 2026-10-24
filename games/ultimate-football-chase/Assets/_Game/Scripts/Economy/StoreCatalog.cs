using System;

namespace UltimateFootballChase.Economy
{
    public enum StoreCurrency { Coins, Gems, RealMoney }
    public enum StoreAvailability { GuestDemoTint, PreviewOnly }

    /// <summary>Artwork/product offers are placeholders until source art, server ledger and IAP validation exist.</summary>
    public sealed class StoreItem
    {
        public readonly string Id, Name, Category;
        public readonly StoreCurrency Currency;
        public readonly StoreAvailability Availability;
        public readonly int ProvisionalCost;
        public StoreItem(string id, string name, string category, StoreCurrency currency,
            StoreAvailability availability, int provisionalCost = 0)
        {
            Id = id; Name = name; Category = category;
            Currency = currency; Availability = availability; ProvisionalCost = provisionalCost;
        }
    }

    public static class StoreCatalog
    {
        // 6 ordinary / 4 premium = proposed 60/40 layout; preview entries are NOT purchasable.
        // Coins are never exchangeable for gems/premium goods. Prices are prototype estimates.
        public static readonly StoreItem[] Items = {
            new StoreItem("cobalt", "Cobalt Greybox Tint", "Kit tint", StoreCurrency.Coins, StoreAvailability.GuestDemoTint, 75),
            new StoreItem("coral", "Coral Greybox Tint", "Kit tint", StoreCurrency.Coins, StoreAvailability.GuestDemoTint, 100),
            new StoreItem("mint", "Mint Greybox Tint", "Kit tint", StoreCurrency.Coins, StoreAvailability.GuestDemoTint, 125),
            new StoreItem("original_sprinter", "Original Sprinter", "Character concept", StoreCurrency.Coins, StoreAvailability.PreviewOnly),
            new StoreItem("comet_board", "Comet Board", "Board concept", StoreCurrency.Coins, StoreAvailability.PreviewOnly),
            new StoreItem("lantern_board", "Lantern Board", "Board concept", StoreCurrency.Coins, StoreAvailability.PreviewOnly),
            new StoreItem("original_guardian", "Original Guardian", "Character concept", StoreCurrency.Gems, StoreAvailability.PreviewOnly),
            new StoreItem("fictional_legend_kit", "World Legends League original kit", "Kit concept", StoreCurrency.Gems, StoreAvailability.PreviewOnly),
            new StoreItem("premium_glider", "Glider Board", "Board concept", StoreCurrency.Gems, StoreAvailability.PreviewOnly),
            new StoreItem("premium_champion", "Original Champion", "Character concept", StoreCurrency.RealMoney, StoreAvailability.PreviewOnly)
        };
        public static StoreItem Find(string id)
        {
            foreach (StoreItem item in Items) if (item.Id == id) return item;
            return null;
        }
        public static bool IsDemoTint(string id) => Find(id)?.Availability == StoreAvailability.GuestDemoTint;
    }
}
