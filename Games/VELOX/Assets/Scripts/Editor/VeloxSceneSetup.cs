#if UNITY_EDITOR
using UnityEditor; using UnityEditor.SceneManagement; using UnityEngine;
namespace Velox.EditorTools
{
    /// <summary>Menu: VELOX ▸ Create Main Scene — builds a clean, original VELOX scene (no imported game scenes).</summary>
    public static class VeloxSceneSetup
    {
        [MenuItem("VELOX/Create Main Scene")]
        public static void Create()
        { var s=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
          new GameObject("GameManager").AddComponent<Core.GameManager>();
          new GameObject("SceneBootstrapper").AddComponent<Core.SceneBootstrapper>();
          new GameObject("TrackGenerator").AddComponent<World.TrackGenerator>();
          new GameObject("BillboardSpawner").AddComponent<Ads.BillboardSpawner>();
          new GameObject("VeloxAudioManager").AddComponent<Audio.VeloxAudioManager>();
          new GameObject("GoogleSignInProvider").AddComponent<Auth.GoogleSignInProvider>();
          new GameObject("VeloxBackendClient").AddComponent<Auth.VeloxBackendClient>();
          new GameObject("AuthService").AddComponent<Auth.AuthService>();
          new GameObject("LeaderboardService").AddComponent<Leaderboard.LeaderboardService>();
          var cam=new GameObject("Main Camera"){tag="MainCamera"}; cam.AddComponent<Camera>(); cam.transform.position=new Vector3(0,5.5f,-7f); cam.transform.rotation=Quaternion.Euler(18f,0,0);
          var light=new GameObject("Directional Light"); light.AddComponent<Light>().type=LightType.Directional; light.transform.rotation=Quaternion.Euler(50f,-30f,0);
          System.IO.Directory.CreateDirectory("Assets/Scenes"); EditorSceneManager.SaveScene(s,"Assets/Scenes/Main.unity");
          Debug.Log("[VELOX] Main scene created. Next: create VisualCatalog/AudioCatalog assets (Assets ▸ Create ▸ VELOX) and wire Inspector slots."); }
    }
}
#endif
