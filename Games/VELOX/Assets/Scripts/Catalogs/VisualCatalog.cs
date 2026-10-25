using UnityEngine;
namespace Velox.Catalogs
{
    /// <summary>
    /// Complete-reskin catalog. EVERY slot ships EMPTY in source control: assign only original or
    /// commercially-licensed assets you own (see Docs/ASSET_LICENSE_CHECKLIST.md). No legacy character,
    /// railway, train or barrier asset is referenced by type, name or GUID anywhere in this project.
    /// </summary>
    [CreateAssetMenu(fileName="VisualCatalog", menuName="VELOX/Catalogs/Visual Catalog")]
    public sealed class VisualCatalog : ScriptableObject
    {
        [Header("Hero — NEO (original cartoon human, assign your own model)")]
        public GameObject neoCharacterPrefab;
        public RuntimeAnimatorController neoAnimatorController;
        public Avatar neoAvatar;

        [Header("Environment — modern / cyberpunk city (original)")]
        public GameObject[] roadSegmentPrefabs;
        public GameObject[] buildingPrefabs;
        public GameObject[] streetPropPrefabs;      // lamps, hydrants, kiosks, neon signs (originals)
        public Material roadMaterial, sidewalkMaterial, buildingMaterial;
        public Color fogColor = new Color(0.05f,0.07f,0.16f);
        public Color neonAccent = new Color(0f,0.9f,1f);

        [Header("Obstacles — city theme only")]
        public GameObject concreteBarrierPrefab;    // jump / slide variants via ObstacleDefinition
        public GameObject parkedCarPrefab;
        public GameObject roadBlockPrefab;
        public GameObject overheadSignPrefab;       // slide-under
        public GameObject coinPrefab;
    }
}
