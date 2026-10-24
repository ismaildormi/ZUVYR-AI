#if UNITY_EDITOR
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UltimateFootballChase.Core;
using UltimateFootballChase.Difficulty;
using UltimateFootballChase.PowerUps;
using UltimateFootballChase.Hub;

namespace UltimateFootballChase.Editor
{
    /// <summary>Generates only original greybox content; rerun safely if the scene needs resetting.</summary>
    public static class GameSceneBuilder
    {
        private const string ConfigPath = "Assets/_Game/Resources/RunConfig.asset";
        private const string DifficultyPath = "Assets/_Game/Resources/DifficultyProfile.asset";
        private const string PowerPath = "Assets/_Game/Resources/PowerUpConfig.asset";
        private const string HubPath = "Assets/_Game/Resources/HubConfig.asset";
        private const string HubScenePath = "Assets/_Game/Scenes/Hub.unity";
        private const string ScenePath = "Assets/_Game/Scenes/Phase1Runner.unity";

        [MenuItem("Tools/Ultimate Football Chase/TEST ONLY - Set Local Guest To 5 Stages")]
        public static void UnlockForEditorQA()
        {
            if (!EditorUtility.DisplayDialog("Local guest QA only",
                "This changes ONLY device-local test progression to five completed stages. It does not grant cloud/leaderboard rewards. Continue?",
                "Set 5 locally", "Cancel")) return;
            HubProgress guest = HubGuestProgress.Load();
            guest.CompletedStages = 5;
            guest.Position = Vector3.zero;
            HubGuestProgress.Save(guest);
            EditorUtility.DisplayDialog("Test progression saved", "Re-enter Play mode in the Hub to see both gates open.", "OK");
        }

        [MenuItem("Tools/Ultimate Football Chase/Build Phases 1–4 Scenes")]
        public static void Build()
        {
            // Empty directories do not survive Git; create them on first Unity import.
            if (!AssetDatabase.IsValidFolder("Assets/_Game/Resources"))
                AssetDatabase.CreateFolder("Assets/_Game", "Resources");
            if (!AssetDatabase.IsValidFolder("Assets/_Game/Scenes"))
                AssetDatabase.CreateFolder("Assets/_Game", "Scenes");
            RunConfig config = AssetDatabase.LoadAssetAtPath<RunConfig>(ConfigPath);
            if (config == null)
            {
                config = ScriptableObject.CreateInstance<RunConfig>();
                AssetDatabase.CreateAsset(config, ConfigPath);
            }
            DifficultyProfile difficulty = AssetDatabase.LoadAssetAtPath<DifficultyProfile>(DifficultyPath);
            if (difficulty == null)
            {
                difficulty = ScriptableObject.CreateInstance<DifficultyProfile>();
                AssetDatabase.CreateAsset(difficulty, DifficultyPath);
            }
            PowerUpConfig power = AssetDatabase.LoadAssetAtPath<PowerUpConfig>(PowerPath);
            if (power == null)
            {
                power = ScriptableObject.CreateInstance<PowerUpConfig>();
                AssetDatabase.CreateAsset(power, PowerPath);
            }
            HubConfig hub = AssetDatabase.LoadAssetAtPath<HubConfig>(HubPath);
            if (hub == null)
            {
                hub = ScriptableObject.CreateInstance<HubConfig>();
                AssetDatabase.CreateAsset(hub, HubPath);
            }
            // Never override owner/playtest tuning after the assets are created.
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var game = new GameObject("Ultimate Football Chase - Phases 1–3");
            GameDirector director = game.AddComponent<GameDirector>();
            SerializedObject serialized = new SerializedObject(director);
            serialized.FindProperty("config").objectReferenceValue = config;
            serialized.FindProperty("difficulty").objectReferenceValue = difficulty;
            serialized.FindProperty("powerConfig").objectReferenceValue = power;
            serialized.ApplyModifiedPropertiesWithoutUndo();
            RenderSettings.ambientLight = new Color(.50f, .57f, .66f);
            EditorSceneManager.SaveScene(scene, ScenePath);
            var hubScene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var hubRoot = new GameObject("Ultimate Football Chase - Hub");
            HubDirector hubDirector = hubRoot.AddComponent<HubDirector>();
            SerializedObject hubObject = new SerializedObject(hubDirector);
            hubObject.FindProperty("config").objectReferenceValue = hub;
            hubObject.ApplyModifiedPropertiesWithoutUndo();
            EditorSceneManager.SaveScene(hubScene, HubScenePath);
            EditorBuildSettings.scenes = new[]
            {
                new EditorBuildSettingsScene(HubScenePath, true),
                new EditorBuildSettingsScene(ScenePath, true)
            };
            PlayerSettings.productName = "Ultimate Football Chase";
            PlayerSettings.defaultInterfaceOrientation = UIOrientation.Portrait;
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            EditorUtility.DisplayDialog("Phases 1–4 ready", "Hub and runner scenes were generated and added to Build Settings. Press Play in Hub. Greybox props appear in Play mode.", "OK");
        }
    }
}
#endif
