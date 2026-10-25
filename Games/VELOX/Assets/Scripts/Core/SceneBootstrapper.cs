using UnityEngine; using Velox.Catalogs; using Velox.Player;
namespace Velox.Core
{
    /// <summary>Spawns NEO: the assigned VisualCatalog prefab when present, otherwise the procedural
    /// NEO (NeoProceduralFactory + NeoRunnerMotion) — the hero slot is never visually empty.</summary>
    public sealed class SceneBootstrapper : MonoBehaviour
    {
        [SerializeField] private VisualCatalog visualCatalog; [SerializeField] private Transform spawnPoint;
        public GameObject SpawnedHero { get; private set; }
        private void Awake()
        {
            Vector3 pos = spawnPoint ? spawnPoint.position : Vector3.zero;
            if (visualCatalog && visualCatalog.neoCharacterPrefab)
                SpawnedHero = Instantiate(visualCatalog.neoCharacterPrefab, pos, Quaternion.identity);
            else
            { SpawnedHero = NeoProceduralFactory.Build(); SpawnedHero.transform.position = pos;
              Debug.Log("[VELOX] No NEO prefab assigned — using procedural NEO (assign an original model in VisualCatalog to replace it)."); }
            SpawnedHero.name = GameConstants.HeroName;
            if (!SpawnedHero.GetComponent<PlayerController>()) SpawnedHero.AddComponent<PlayerController>();
            if (!SpawnedHero.GetComponent<CharacterController>()) SpawnedHero.AddComponent<CharacterController>();
            if (visualCatalog) RenderSettings.fogColor = visualCatalog.fogColor;
        }
    }
}
