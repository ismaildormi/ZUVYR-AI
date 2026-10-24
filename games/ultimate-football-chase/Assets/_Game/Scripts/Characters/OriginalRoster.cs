using UnityEngine;
using UltimateFootballChase.Gameplay;
using UltimateFootballChase.Hub;

namespace UltimateFootballChase.Characters
{
    /// <summary>Eight original greybox silhouettes. No licensed people, clubs, logos, or paid entitlements.</summary>
    public static class OriginalRoster
    {
        public static readonly string[] Ids = { "kivo", "mira", "selo", "nexa", "taro", "lumi", "vora", "ziri" };
        public static readonly string[] Names = {
            "Kivo the Trickster", "Mira the Guardian", "Selo the Sprinter", "Nexa the Stargazer",
            "Taro the Pathfinder", "Lumi the Inventor", "Vora the Dynamo", "Ziri the Dreamer"
        };
        public static readonly string[] KitIds = { "teal", "amber", "violet", "storm", "dawn", "ember", "lagoon", "rose" };
        // Provisional preview-stage unlocks, NEVER verified purchases or account entitlements.
        public static readonly int[] KitStages = { 0, 0, 0, 5, 10, 15, 20, 25 };
        public static bool CanSelectKit(string id, int completedStages)
        {
            int index = System.Array.IndexOf(KitIds, id);
            return index >= 0 && completedStages >= KitStages[index];
        }
        public static Color CharacterAccent(string id)
        {
            switch (id)
            {
                case "mira": return new Color(.36f,.72f,.95f);
                case "selo": return new Color(.97f,.43f,.51f);
                case "nexa": return new Color(.73f,.53f,.94f);
                case "taro": return new Color(.98f,.62f,.37f);
                case "lumi": return new Color(.53f,.91f,.69f);
                case "vora": return new Color(.82f,.44f,.69f);
                case "ziri": return new Color(.47f,.83f,.84f);
                default: return new Color(.96f,.71f,.24f);
            }
        }
        public static Color KitColor(string characterId, string kitId)
        {
            Color tint = HubWorldBuilder.OutfitColor(kitId);
            Color personalAccent = CharacterAccent(characterId);
            return Color.Lerp(tint, personalAccent, .16f); // 64 original per-character greybox colour treatments
        }
        public static bool Contains(string id)
        {
            foreach (string candidate in Ids) if (candidate == id) return true;
            return false;
        }
        public static void AddGreyboxVariants(Transform body)
        {
            for (int i = 0; i < Ids.Length; i++)
            {
                Transform group = new GameObject("Original character " + Ids[i]).transform;
                group.SetParent(body, false);
                Color accent = CharacterAccent(Ids[i]);
                switch (i)
                {
                    case 0:
                        GreyboxFactory.Primitive("Original swoop cap", PrimitiveType.Cube, group,
                            new Vector3(0,.87f,.1f), new Vector3(.76f,.12f,.69f), accent);
                        GreyboxFactory.Primitive("Swoop brim", PrimitiveType.Cube, group,
                            new Vector3(0,.84f,.48f), new Vector3(.7f,.07f,.38f), accent); break;
                    case 1:
                        GreyboxFactory.Primitive("Guardian shoulder A", PrimitiveType.Sphere, group,
                            new Vector3(-.62f,.23f,0), new Vector3(.38f,.28f,.36f), accent);
                        GreyboxFactory.Primitive("Guardian shoulder B", PrimitiveType.Sphere, group,
                            new Vector3(.62f,.23f,0), new Vector3(.38f,.28f,.36f), accent); break;
                    case 2:
                        GreyboxFactory.Primitive("Original speed stripe", PrimitiveType.Cube, group,
                            new Vector3(0,.81f,.04f), new Vector3(.68f,.09f,.65f), accent);
                        GreyboxFactory.Primitive("Original scarf", PrimitiveType.Cube, group,
                            new Vector3(0,.24f,-.42f), new Vector3(.18f,.16f,.7f), accent); break;
                    case 3:
                        GreyboxFactory.Primitive("Star visor", PrimitiveType.Cube, group,
                            new Vector3(0,.58f,.41f), new Vector3(.64f,.19f,.11f), accent);
                        GreyboxFactory.Primitive("Star crest", PrimitiveType.Sphere, group,
                            new Vector3(0,1f,0), new Vector3(.24f,.24f,.24f), accent); break;
                    case 4:
                        GreyboxFactory.Primitive("Pathfinder brow", PrimitiveType.Cube, group,
                            new Vector3(0,.73f,.40f), new Vector3(.82f,.12f,.16f), accent);
                        GreyboxFactory.Primitive("Pathfinder compass crest", PrimitiveType.Cylinder, group,
                            new Vector3(0,.98f,0), new Vector3(.25f,.12f,.25f), accent); break;
                    case 5:
                        for (int side = -1; side <= 1; side += 2)
                            GreyboxFactory.Primitive("Inventor ear lens", PrimitiveType.Sphere, group,
                                new Vector3(side * .43f,.57f,0), new Vector3(.22f,.27f,.27f), accent);
                        GreyboxFactory.Primitive("Inventor collar", PrimitiveType.Cylinder, group,
                            new Vector3(0,.34f,0), new Vector3(.67f,.12f,.67f), accent); break;
                    case 6:
                        GreyboxFactory.Primitive("Dynamo split crest left", PrimitiveType.Cube, group,
                            new Vector3(-.22f,.96f,0), new Vector3(.23f,.25f,.26f), accent);
                        GreyboxFactory.Primitive("Dynamo split crest right", PrimitiveType.Cube, group,
                            new Vector3(.22f,.96f,0), new Vector3(.23f,.25f,.26f), accent);
                        GreyboxFactory.Primitive("Dynamo wrist arc", PrimitiveType.Sphere, group,
                            new Vector3(.63f,-.06f,.12f), new Vector3(.26f,.26f,.26f), accent); break;
                    case 7:
                        GreyboxFactory.Primitive("Dreamer floating circlet", PrimitiveType.Cylinder, group,
                            new Vector3(0,1.06f,0), new Vector3(.65f,.05f,.65f), accent);
                        GreyboxFactory.Primitive("Dreamer badge", PrimitiveType.Sphere, group,
                            new Vector3(0,.23f,.45f), new Vector3(.25f,.25f,.12f), accent); break;
                }
            }
        }
        public static void Show(Transform body, string selected)
        {
            if (!Contains(selected)) selected = Ids[0];
            foreach (string id in Ids)
            {
                Transform group = body.Find("Original character " + id);
                if (group != null) group.gameObject.SetActive(id == selected);
            }
        }
    }
}
