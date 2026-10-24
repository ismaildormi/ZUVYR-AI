using System;
using UnityEngine;

namespace UltimateFootballChase.Economy
{
    public enum StoreCurrency { Coins, Gems, RealMoney }
    public enum StoreAvailability { GuestDemoTint, GuestDemoBoard, GuestDemoPack, PreviewOnly }

    /// <summary>Artwork/product offers are placeholders until source art, server ledger and IAP validation exist.</summary>
    public sealed class StoreItem
    {
        public readonly string Id, Name, Category;
        public readonly StoreCurrency Currency;
        public readonly StoreAvailability Availability;
        public readonly int ProvisionalCost;
        public readonly string[] Contents;
        public StoreItem(string id, string name, string category, StoreCurrency currency,
            StoreAvailability availability, int provisionalCost = 0, string[] contents = null)
        {
            Id = id; Name = name; Category = category;
            Currency = currency; Availability = availability; ProvisionalCost = provisionalCost;
            Contents = contents ?? Array.Empty<string>();
        }
    }

    public static class StoreCatalog
    {
        // V2: local-only demo goods. Premium preview entries have no checkout path.
        public static readonly StoreItem[] Items = {
            new StoreItem("cobalt", "Cobalt", "Original skin", StoreCurrency.Coins, StoreAvailability.GuestDemoTint, 75),
            new StoreItem("coral", "Coral", "Original skin", StoreCurrency.Coins, StoreAvailability.GuestDemoTint, 100),
            new StoreItem("mint", "Mint", "Original skin", StoreCurrency.Coins, StoreAvailability.GuestDemoTint, 125),
            new StoreItem("aurora", "Aurora", "Original skin", StoreCurrency.Coins, StoreAvailability.GuestDemoTint, 145),
            new StoreItem("pearl", "Pearl", "Original skin", StoreCurrency.Coins, StoreAvailability.GuestDemoTint, 165),
            new StoreItem("nightfall", "Nightfall", "Original skin", StoreCurrency.Coins, StoreAvailability.GuestDemoTint, 180),
            new StoreItem("comet_board", "Comet Deck", "Original board", StoreCurrency.Coins, StoreAvailability.GuestDemoBoard, 130),
            new StoreItem("lantern_board", "Lantern Deck", "Original board", StoreCurrency.Coins, StoreAvailability.GuestDemoBoard, 155),
            new StoreItem("ripple_board", "Ripple Deck", "Original board", StoreCurrency.Coins, StoreAvailability.GuestDemoBoard, 185),
            new StoreItem("pack_city_glow", "City Glow Pack", "Local demo pack", StoreCurrency.Coins,
                StoreAvailability.GuestDemoPack, 250, new[] { "cobalt", "coral", "comet_board" }),
            new StoreItem("pack_celestial", "Celestial Pack", "Local demo pack", StoreCurrency.Coins,
                StoreAvailability.GuestDemoPack, 290, new[] { "mint", "aurora", "lantern_board" }),
            new StoreItem("pack_moonrise", "Moonrise Pack", "Local demo pack", StoreCurrency.Coins,
                StoreAvailability.GuestDemoPack, 325, new[] { "pearl", "nightfall", "ripple_board" }),
            new StoreItem("original_sprinter", "Original Sprinter", "Character concept", StoreCurrency.Gems, StoreAvailability.PreviewOnly),
            new StoreItem("original_guardian", "Original Guardian", "Character concept", StoreCurrency.Gems, StoreAvailability.PreviewOnly),
            new StoreItem("fictional_legend_kit", "World Legends League original kit", "Kit concept", StoreCurrency.Gems, StoreAvailability.PreviewOnly),
            new StoreItem("premium_champion", "Original Champion", "Character concept", StoreCurrency.RealMoney, StoreAvailability.PreviewOnly),
            new StoreItem("premium_starlight", "Starlight Outfit", "Outfit concept", StoreCurrency.Gems, StoreAvailability.PreviewOnly),
            new StoreItem("premium_celestial_board", "Celestial Deck", "Board concept", StoreCurrency.Gems, StoreAvailability.PreviewOnly),
            new StoreItem("premium_festival", "Festival Bundle", "Pack concept", StoreCurrency.RealMoney, StoreAvailability.PreviewOnly),
            new StoreItem("premium_shadow", "Shadow Outfit", "Outfit concept", StoreCurrency.Gems, StoreAvailability.PreviewOnly)
        };
        public static StoreItem Find(string id)
        {
            foreach (StoreItem item in Items) if (item.Id == id) return item;
            return null;
        }
        public static bool IsDemoTint(string id) => Find(id)?.Availability == StoreAvailability.GuestDemoTint;
        public static bool IsDemoBoard(string id) => Find(id)?.Availability == StoreAvailability.GuestDemoBoard;
        public static bool IsDemoPack(string id) => Find(id)?.Availability == StoreAvailability.GuestDemoPack;
        public static bool IsGuestDemo(StoreItem item) => item != null && item.Currency == StoreCurrency.Coins &&
            (item.Availability == StoreAvailability.GuestDemoTint ||
             item.Availability == StoreAvailability.GuestDemoBoard ||
             item.Availability == StoreAvailability.GuestDemoPack);
        public static Color BoardColor(string id)
        {
            switch (id)
            {
                case "comet_board": return new Color(.95f, .63f, .25f);
                case "lantern_board": return new Color(.72f, .46f, .94f);
                case "ripple_board": return new Color(.25f, .86f, .81f);
                default: return new Color(1f, .8f, .23f);
            }
        }
    }
}
