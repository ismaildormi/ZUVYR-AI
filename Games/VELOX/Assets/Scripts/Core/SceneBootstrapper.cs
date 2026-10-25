using UnityEngine; using Velox.Catalogs;
namespace Velox.Core
{
    /// <summary>Spawns NEO from the VisualCatalog slot at runtime, so swapping the hero model =
    /// changing one Inspector reference — the legacy character is never referenced in code.</summary>
    public sealed class SceneBootstrapper : MonoBehaviour
    {
        [SerializeField] private VisualCatalog visualCatalog; [SerializeField] private Transform spawnPoint;
        private void Awake()
        { if(!visualCatalog || !visualCatalog.neoCharacterPrefab){ Debug.LogWarning("[VELOX] VisualCatalog.neoCharacterPrefab is empty — assign the original NEO model (Docs/ASSET_LICENSE_CHECKLIST.md)."); return; }
          var neo=Instantiate(visualCatalog.neoCharacterPrefab, spawnPoint?spawnPoint.position:Vector3.zero, Quaternion.identity);
          neo.name=GameConstants.HeroName; RenderSettings.fogColor=visualCatalog.fogColor; }
    }
}
