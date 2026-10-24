using UnityEngine;
using UltimateFootballChase.Gameplay;

namespace UltimateFootballChase.Characters
{
    /// <summary>Four original greybox silhouettes. No licensed people, clubs, logos, or paid entitlements.</summary>
    public static class OriginalRoster
    {
        public static readonly string[] Ids = { "kivo", "mira", "selo", "nexa" };
        public static readonly string[] Names = { "Kivo the Trickster", "Mira the Guardian", "Selo the Sprinter", "Nexa the Stargazer" };
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
                Color accent = i == 0 ? new Color(.96f,.71f,.24f) :
                    i == 1 ? new Color(.36f,.72f,.95f) :
                    i == 2 ? new Color(.97f,.43f,.51f) : new Color(.73f,.53f,.94f);
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
