using NUnit.Framework;
using UnityEngine;
using UltimateFootballChase.Characters;
using UltimateFootballChase.Gameplay;
using UltimateFootballChase.Hub;
using UltimateFootballChase.Backend;

namespace UltimateFootballChase.Tests
{
    public sealed class Phase12Tests
    {
        [Test]
        public void FiveSkinTonesAndOptionalHeadwearCycleWithoutInvalidIds()
        {
            Assert.AreEqual(5, OriginalRoster.SkinToneIds.Length);
            Assert.AreEqual(5, OriginalRoster.HeadwearIds.Length);
            Assert.AreEqual("sunlit", OriginalRoster.NextSkinTone("unknown"));
            Assert.AreEqual("none", OriginalRoster.NextHeadwear("unknown"));
            Assert.AreEqual("sunlit", OriginalRoster.NextSkinTone("deep"));
            Assert.AreEqual("none", OriginalRoster.NextHeadwear("crest"));
        }

        [Test]
        public void TamperedOrMissingAppearanceFallsBackToSafeOriginalDefaults()
        {
            var oldSave = new HubProgress { SkinToneId = null, HeadwearId = "third_party_hat" };
            HubProgressSanitizer.Clean(oldSave);
            Assert.AreEqual("warm", oldSave.SkinToneId);
            Assert.AreEqual("none", oldSave.HeadwearId);
        }

        [Test]
        public void HeadwearOnlyTogglesSelectedOriginalPart_AndTonesAffectHead()
        {
            var root = new GameObject("Appearance QA");
            try
            {
                var body = GreyboxFactory.Primitive("Original body", PrimitiveType.Capsule, root.transform,
                    Vector3.zero, Vector3.one, Color.white);
                var head = GreyboxFactory.Primitive("Original character head", PrimitiveType.Sphere, body,
                    Vector3.up, Vector3.one, Color.white);
                OriginalRoster.AddHeadwearOptions(body);
                OriginalRoster.ApplyAppearance(body, "deep", "visor");
                Assert.AreEqual(OriginalRoster.SkinToneColor("deep"), head.GetComponent<Renderer>().material.color);
                Assert.IsTrue(body.Find("Optional headwear visor").gameObject.activeSelf);
                Assert.IsFalse(body.Find("Optional headwear cap").gameObject.activeSelf);
                OriginalRoster.ApplyAppearance(body, "sunlit", "none");
                Assert.IsFalse(body.Find("Optional headwear visor").gameObject.activeSelf);
            }
            finally { Object.DestroyImmediate(root); }
        }

        [Test]
        public void PreviewAccountMergeUsesMostRecentAppearanceOnly()
        {
            var remote = new HubProgress { LastSavedUtcTicks = 10, SkinToneId = "bronze", HeadwearId = "cap" };
            var local = new HubProgress { LastSavedUtcTicks = 20, SkinToneId = "umber", HeadwearId = "band" };
            var merged = AccountHubPolicy.Merge(remote, local);
            Assert.AreEqual("umber", merged.SkinToneId);
            Assert.AreEqual("band", merged.HeadwearId);
            Assert.AreEqual("bronze", remote.SkinToneId);
        }
    }
}
