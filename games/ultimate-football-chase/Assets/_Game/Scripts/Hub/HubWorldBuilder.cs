using System;
using System.Collections.Generic;
using UnityEngine;
using UltimateFootballChase.Characters;
using UltimateFootballChase.Gameplay;

namespace UltimateFootballChase.Hub
{
    /// <summary>Hand-placed, original 3D greybox landmarks. Replaces neither licensed assets nor final art.</summary>
    public sealed class HubWorldBuilder
    {
        public readonly Transform Root;
        public Transform Goalkeeper { get; private set; }
        public Transform Mannequin { get; private set; }
        public Renderer Window { get; private set; }
        public readonly List<Transform> Birds = new List<Transform>();
        private readonly List<Transform> candleFlames = new List<Transform>();
        private readonly List<Transform> walkers = new List<Transform>();
        private readonly List<GameObject> trophies = new List<GameObject>();
        private TextMesh overflowTrophyPlaque;
        private readonly GameObject[] seasonalDecor = new GameObject[4];
        private GameObject marketGate, pitchGate;
        private Light sun;

        public HubWorldBuilder()
        {
            Root = new GameObject("Hand-authored four-zone Hub").transform;
            MakeGround(new Vector3(0, 0, 0), new Vector3(28, .3f, 28), new Color(.20f, .34f, .38f));
            MakeGround(new Vector3(-24, 0, 0), new Vector3(30, .3f, 26), new Color(.22f, .28f, .38f));
            MakeGround(new Vector3(24, 0, 0), new Vector3(34, .3f, 26), new Color(.31f, .32f, .37f));
            MakeGround(new Vector3(0, 0, 32), new Vector3(30, .3f, 30), new Color(.19f, .42f, .33f));
            MakeGround(new Vector3(14, 0, 0), new Vector3(9, .32f, 8), new Color(.47f, .45f, .37f));
            MakeGround(new Vector3(-14, 0, 0), new Vector3(9, .32f, 8), new Color(.47f, .45f, .37f));
            MakeGround(new Vector3(0, 0, 17), new Vector3(8, .32f, 10), new Color(.47f, .45f, .37f));
            BuildPlaza(); BuildHome(); BuildPitch(); BuildMarket(); BuildDetails(); BuildSeasonVariants();
            sun = new GameObject("Day / night sunlight", typeof(Light)).GetComponent<Light>();
            sun.transform.SetParent(Root);
            sun.type = LightType.Directional;
            sun.transform.rotation = Quaternion.Euler(45f, -32f, 0f);
        }
        private void MakeGround(Vector3 centre, Vector3 size, Color tint) =>
            GreyboxFactory.Primitive("Authored ground", PrimitiveType.Cube, Root,
                centre + Vector3.down * .18f, size, tint);
        private Transform Block(string name, Vector3 position, Vector3 scale, Color tint, Transform parent = null)
        {
            return GreyboxFactory.Primitive(name, PrimitiveType.Cube, parent ?? Root, position, scale, tint);
        }
        private void BuildPlaza()
        {
            Block("Central plaza raised podium", new Vector3(0, .20f, 0), new Vector3(6, .4f, 6), new Color(.48f, .44f, .38f));
            Block("Run entry arch left", new Vector3(-2.4f, 2.2f, 8), new Vector3(.4f, 4.4f, .5f), new Color(.87f, .54f, .18f));
            Block("Run entry arch right", new Vector3(2.4f, 2.2f, 8), new Vector3(.4f, 4.4f, .5f), new Color(.87f, .54f, .18f));
            Block("RUN portal", new Vector3(0, 4.35f, 8), new Vector3(5, .45f, .55f), new Color(.87f, .54f, .18f));
            Block("UNVERIFIED LEADERBOARD - offline placeholder", new Vector3(6, 3.1f, -6),
                new Vector3(7, 5, .4f), new Color(.06f, .16f, .23f));
            // Never fabricate Top 10 player names or server-validated ranks.
            WorldText("TOP 10 • SERVER BOARD\nNOT AVAILABLE OFFLINE", new Vector3(6, 3.4f, -6.3f), 55, .065f);
            Block("Showdown noticeboard (server required)", new Vector3(-6, 2.6f, -6),
                new Vector3(5f, 4f, .35f), new Color(.18f, .22f, .39f));
            WorldText("SHOWDOWN • 3–5 DAY EVENTS\nNO OPPONENTS OFFLINE",
                new Vector3(-6, 3f, -6.3f), 37, .06f);
            Block("World Legends League concept board", new Vector3(9, 2f, 5),
                new Vector3(3f, 3f, .35f), new Color(.25f,.35f,.44f));
            WorldText("FICTIONAL LEAGUE\n8 ORIGINAL TEAMS", new Vector3(9, 3f, 4.7f), 35, .06f);
            Block("Original symbolic fountain", new Vector3(0, 1.1f, 0), new Vector3(2.1f, 1.8f, 2.1f),
                new Color(.30f, .73f, .77f));
        }
        private void BuildHome()
        {
            Block("Home outer wall", new Vector3(-36.8f, 1.2f, 0), new Vector3(.3f, 2.4f, 23), new Color(.42f, .48f, .52f));
            Block("Home bed", new Vector3(-32.8f, .32f, 6), new Vector3(4.4f, .6f, 2.9f), new Color(.44f, .29f, .49f));
            Block("Wardrobe cabinet", new Vector3(-30f, 1.3f, -6), new Vector3(3, 2.6f, 1.2f), new Color(.36f, .21f, .18f));
            Mannequin = GreyboxFactory.Primitive("3D wardrobe mannequin (placeholder)", PrimitiveType.Capsule, Root,
                new Vector3(-27f, 1f, 3f), new Vector3(.86f, 1f, .86f), new Color(.21f, .88f, .68f));
            OriginalRoster.AddGreyboxVariants(Mannequin);
            Block("Achievement shelf", new Vector3(-23f, 2.6f, -10.2f), new Vector3(11f, .2f, .75f), new Color(.53f, .38f, .22f));
            for (int i = 0; i < 10; i++)
            {
                Transform cup = GreyboxFactory.Primitive("Stage trophy " + (i + 1), PrimitiveType.Cylinder, Root,
                    new Vector3(-27.5f + i * .95f, 3f, -10.1f), new Vector3(.48f, .45f, .48f), new Color(.90f, .72f, .26f));
                trophies.Add(cup.gameObject);
            }
            overflowTrophyPlaque = WorldText("", new Vector3(-23f, 4f, -10.4f), 38, .045f);
            Window = Block("Real device time window", new Vector3(-35.9f, 1.7f, 3),
                new Vector3(.08f, 1.6f, 2.7f), new Color(.37f, .71f, .9f)).GetComponent<Renderer>();
        }
        private void BuildPitch()
        {
            Block("Original football goal top", new Vector3(0, 2.8f, 42f), new Vector3(5f, .18f, .18f), Color.white);
            for (int side = -1; side <= 1; side += 2)
                Block("Goal post", new Vector3(side * 2.45f, 1.4f, 42f), new Vector3(.16f, 2.8f, .16f), Color.white);
            for (int i = -2; i <= 2; i++)
                Block("Goal net vertical", new Vector3(i, 1.5f, 42.2f), new Vector3(.05f, 2.8f, .05f), new Color(.77f, .88f, .84f));
            Goalkeeper = GreyboxFactory.Primitive("Original goalkeeper practice NPC", PrimitiveType.Capsule, Root,
                new Vector3(0, 1f, 40), new Vector3(.85f, 1f, .85f), new Color(.84f, .44f, .73f));
            Block("Jump practice barrier", new Vector3(-3.5f, .42f, 29f), new Vector3(1.7f, .84f, .7f), new Color(1f, .58f, .21f));
            Block("Slide practice beam", new Vector3(3.5f, 1.7f, 29f), new Vector3(1.7f, .6f, .7f), new Color(.72f, .43f, .91f));
        }
        private void BuildMarket()
        {
            Color[] colours = { new Color(.64f, .32f, .24f), new Color(.37f, .61f, .68f), new Color(.61f, .55f, .28f) };
            string[] labels = { "CHARACTER PREVIEW", "KIT PREVIEW", "BOARD PREVIEW" };
            for (int i = 0; i < 3; i++)
            {
                float x = 19f + i * 6f;
                Block("Vendor " + (i + 1) + " original stall", new Vector3(x, .55f, -4.5f),
                    new Vector3(4.5f, 1.1f, 2.2f), colours[i]);
                Block("Vendor awning", new Vector3(x, 2.45f, -4.5f), new Vector3(4.8f, .35f, 2.5f), colours[i]);
                GreyboxFactory.Primitive("Original vendor NPC", PrimitiveType.Capsule, Root,
                    new Vector3(x, 1f, -2.5f), new Vector3(.75f, .96f, .75f), colours[i]);
                WorldText(labels[i] + "\nGUEST DEMO / PREVIEW", new Vector3(x, 3.2f, -4.7f), 36, .055f);
            }
        }
        private void BuildDetails()
        {
            // Authored coordinates, not a looping random map. Lightweight moving life breaks static repetition.
            Vector3[] details = {
                new Vector3(-11,0,-10), new Vector3(-11,0,10), new Vector3(11,0,-10), new Vector3(11,0,10),
                new Vector3(-35,0,-11), new Vector3(-15,0,-11), new Vector3(17,0,10), new Vector3(36,0,10),
                new Vector3(-12,0,31), new Vector3(12,0,31), new Vector3(-12,0,44), new Vector3(12,0,44)
            };
            foreach (Vector3 at in details)
            {
                Block("Lantern iron stand", at + Vector3.up * .9f, new Vector3(.16f, 1.8f, .16f), new Color(.25f, .31f, .35f));
                candleFlames.Add(GreyboxFactory.Primitive("Animated candle flame", PrimitiveType.Sphere, Root,
                    at + Vector3.up * 1.9f, new Vector3(.3f, .43f, .3f), new Color(1f, .69f, .26f)));
                Block("Living shrub", at + new Vector3(1.1f, .38f, 0), new Vector3(.75f, .75f, .8f), new Color(.17f, .55f, .35f));
            }
            for (int i = 0; i < 2; i++)
                walkers.Add(GreyboxFactory.Primitive("Original strolling Hub NPC", PrimitiveType.Capsule, Root,
                    new Vector3(i == 0 ? -6f : 6f, 1f, -5f), new Vector3(.7f, .9f, .7f),
                    i == 0 ? new Color(.92f, .52f, .45f) : new Color(.60f, .66f, .93f)));
            for (int i = 0; i < 4; i++)
                Birds.Add(GreyboxFactory.Primitive("Original wandering bird", PrimitiveType.Cube, Root,
                    new Vector3(-5 + i * 3.2f, 3.6f, 5), new Vector3(.5f, .18f, .3f), new Color(.25f, .26f, .33f)));
        }
        private void BuildSeasonVariants()
        {
            Color[] colours = {
                new Color(.88f, .45f, .70f), new Color(.97f, .78f, .26f),
                new Color(.92f, .48f, .19f), new Color(.66f, .80f, 1f)
            };
            for (int season = 0; season < seasonalDecor.Length; season++)
            {
                Transform group = new GameObject("Season decor: " + new[] { "Bloom", "Solar", "Amber", "Frost" }[season]).transform;
                group.SetParent(Root, false);
                seasonalDecor[season] = group.gameObject;
                Vector3[] sites = { new Vector3(-7,1.3f,0), new Vector3(7,1.3f,0),
                    new Vector3(-18,1.3f,5), new Vector3(18,1.3f,5), new Vector3(0,1.3f,21) };
                foreach (Vector3 site in sites)
                    GreyboxFactory.Primitive("Seasonal original banner", PrimitiveType.Cube, group,
                        site, new Vector3(.65f, 2.2f, .1f), colours[season]);
                group.gameObject.SetActive(false);
            }
        }
        public void SetStageTrophies(int count)
        {
            for (int i = 0; i < trophies.Count; i++) trophies[i].SetActive(i < count);
            overflowTrophyPlaque.text = count > trophies.Count ? "+" + (count - trophies.Count) + " MORE ORIGINAL AWARDS" : "";
        }
        public void SetSeason(int season)
        {
            for (int i = 0; i < seasonalDecor.Length; i++) seasonalDecor[i].SetActive(i == season);
        }
        public void SetUnlocked(bool unlocked)
        {
            if (marketGate == null)
            {
                marketGate = Block("Market gate (5 stages)", new Vector3(14f, 1.5f, 0),
                    new Vector3(.35f, 3f, 8f), new Color(.85f, .27f, .27f)).gameObject;
                pitchGate = Block("Pitch gate (5 stages)", new Vector3(0, 1.5f, 17),
                    new Vector3(8f, 3f, .35f), new Color(.85f, .27f, .27f)).gameObject;
            }
            marketGate.SetActive(!unlocked);
            pitchGate.SetActive(!unlocked);
        }
        public void SetDaylight(bool day)
        {
            sun.intensity = day ? 1.3f : .35f;
            RenderSettings.ambientLight = day ? new Color(.58f, .65f, .7f) : new Color(.17f, .24f, .38f);
            Window.material.color = day ? new Color(.46f, .83f, .98f) : new Color(.98f, .74f, .27f);
        }
        public void Animate(float time)
        {
            Goalkeeper.position = new Vector3(Mathf.Sin(time * .8f) * 1.5f, 1f, 40);
            for (int i = 0; i < Birds.Count; i++)
                Birds[i].position = new Vector3(-5f + i * 3.2f + Mathf.Sin(time * .6f + i) * 1.1f,
                    3.6f + Mathf.Sin(time * 2f + i) * .22f, 5f + Mathf.Cos(time * .5f + i));
            for (int i = 0; i < candleFlames.Count; i++)
                candleFlames[i].localScale = new Vector3(.3f, .37f + .10f * Mathf.Sin(time * 5f + i * 1.7f), .3f);
            for (int i = 0; i < walkers.Count; i++)
                walkers[i].position = new Vector3(i == 0 ? -6f : 6f, 1f,
                    -5f + Mathf.Sin(time * .55f + i * 2f) * 2f);
            // Visual-only motion; one directional light keeps the scene cheap on mobile.
        }
        private TextMesh WorldText(string message, Vector3 at, int size, float scale)
        {
            var text = new GameObject("Information / not a real ranking", typeof(TextMesh)).GetComponent<TextMesh>();
            text.transform.SetParent(Root);
            text.transform.position = at;
            text.transform.rotation = Quaternion.Euler(0f, 180f, 0f);
            text.transform.localScale = Vector3.one * scale;
            text.text = message;
            text.fontSize = size;
            text.anchor = TextAnchor.MiddleCenter;
            text.alignment = TextAlignment.Center;
            text.color = Color.white;
            return text;
        }
        public static Color OutfitColor(string outfit)
        {
            switch (outfit)
            {
                case "amber": return new Color(.96f, .69f, .23f);
                case "violet": return new Color(.72f, .45f, .88f);
                case "storm": return new Color(.29f, .38f, .54f);
                case "dawn": return new Color(.98f, .52f, .29f);
                case "cobalt": return new Color(.23f, .52f, .92f);
                case "coral": return new Color(.98f, .43f, .38f);
                case "mint": return new Color(.52f, .90f, .71f);
                default: return new Color(.21f, .88f, .68f);
            }
        }
    }
}
