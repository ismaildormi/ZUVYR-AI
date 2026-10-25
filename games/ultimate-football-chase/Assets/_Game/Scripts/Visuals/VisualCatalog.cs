using UnityEngine;
using UltimateFootballChase.Gameplay;

namespace UltimateFootballChase.Visuals
{
    /// <summary>Visual-only references. Game rules, swept hit boxes, and spawn tiers never come from art assets.</summary>
    [CreateAssetMenu(fileName = "VisualCatalog", menuName = "Ultimate Football Chase/Visual Catalog")]
    public sealed class VisualCatalog : ScriptableObject
    {
        [Header("Original / independently licensed human prefab; pivot at feet, forward +Z")]
        public GameObject RunnerPrefab;
        [Header("Optional 24m station segment; show all three lanes clearly")]
        public GameObject StationTilePrefab;
        [Header("Visuals only: keep within the existing arcade hit boxes and safe-lane widths")]
        public GameObject LowBarrierPrefab;
        public GameObject OverheadBeamPrefab;
        public GameObject BlockerPrefab;
        public GameObject SlidingTacklePrefab;
        public GameObject PoliceCarPrefab;
        public GameObject DronePrefab;
        public GameObject TrainPrefab;
        [Header("Optional original UI identity; empty uses the greybox UI")]
        public Font UiFont;
        public Color ButtonColor = new Color(.11f, .43f, .49f, .95f);
        public Color BackdropColor = new Color(.01f, .04f, .09f, .88f);

        public GameObject HazardPrefab(HazardKind kind)
        {
            switch (kind)
            {
                case HazardKind.LowBarrier: return LowBarrierPrefab;
                case HazardKind.OverheadBeam: return OverheadBeamPrefab;
                case HazardKind.Blocker: return BlockerPrefab;
                case HazardKind.SlidingTackle: return SlidingTacklePrefab;
                case HazardKind.PoliceCar: return PoliceCarPrefab;
                case HazardKind.Drone: return DronePrefab;
                case HazardKind.Train: return TrainPrefab;
                default: return null;
            }
        }

        public static GameObject AttachArt(GameObject prefab, Transform parent)
        {
            if (prefab == null) return null;
            GameObject instance = Instantiate(prefab, parent, false);
            instance.transform.localPosition = Vector3.zero;
            instance.transform.localRotation = Quaternion.identity;
            instance.SetActive(true);
            // Gameplay uses explicit swept arcade hit testing; artwork must not inject physics collisions.
            foreach (Collider collider in instance.GetComponentsInChildren<Collider>(true)) collider.enabled = false;
            foreach (Animator animator in instance.GetComponentsInChildren<Animator>(true))
                animator.applyRootMotion = false;
            return instance;
        }
    }
}
