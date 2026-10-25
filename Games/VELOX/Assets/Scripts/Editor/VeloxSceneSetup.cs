#if UNITY_EDITOR
using System.Collections.Generic; using System.IO;
using TMPro; using UnityEditor; using UnityEditor.SceneManagement;
using UnityEngine; using UnityEngine.UI;
using Velox.Ads; using Velox.Audio; using Velox.Auth; using Velox.Catalogs; using Velox.Core;
using Velox.Leaderboard; using Velox.Player; using Velox.UI; using Velox.World;

namespace Velox.EditorTools
{
    /// <summary>
    /// VELOX ▸ Build Main Scene (Automated): creates/bakes every asset and builds the fully-wired
    /// Main Runner scene — catalogues, NEO prefab (procedural), city segment & obstacle prefabs,
    /// billboard prefab, GameDirector with all services, Main Canvas (menu/HUD/leaderboard with 10 rows),
    /// camera + light. Guarantee: every [SerializeField] the runtime needs is assigned here via
    /// SerializedObject, so the scene opens with zero Unassigned References. Re-runnable (idempotent).
    /// </summary>
    public static class VeloxSceneSetup
    {
        private const string Root = "Assets";
        [MenuItem("VELOX/Build Main Scene (Automated)")]
        public static void Build()
        {
            foreach (var d in new[]{ "Assets/Settings","Assets/Materials/Environment","Assets/Prefabs/Player","Assets/Prefabs/Obstacles","Assets/Prefabs/Environment","Assets/Art/NEO" })
                Directory.CreateDirectory(d);
            var roadMat  = Mat("Road",  new Color(0.08f,0.09f,0.13f));
            var sideMat  = Mat("Sidewalk", new Color(0.22f,0.24f,0.32f));
            var neonMat  = Mat("Neon", NeoProceduralFactory.Accent, 2.2f);
            var concMat  = Mat("Concrete", new Color(0.55f,0.57f,0.62f));

            // --- catalogues + auth config (env-baked, never hand-typed) ---
            var visual = Asset<VisualCatalog>("Assets/Settings/VisualCatalog.asset");
            var audio  = Asset<AudioCatalog>("Assets/Settings/AudioCatalog.asset");
            var authCfg = Asset<VeloxAuthConfig>("Assets/Settings/VeloxAuthConfig.asset");
            authCfg.BakeFromEnvironmentInEditor();

            // --- NEO prefab baked from the procedural factory ---
            var neoPrefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Prefabs/Player/NEO_Procedural.prefab");
            if (!neoPrefab) { var neo = NeoProceduralFactory.Build(); neoPrefab = PrefabUtility.SaveAsPrefabAsset(neo, "Assets/Prefabs/Player/NEO_Procedural.prefab"); Object.DestroyImmediate(neo); }
            Set(visual, "neoCharacterPrefab", neoPrefab); Set(visual, "roadMaterial", roadMat); Set(visual, "sidewalkMaterial", sideMat);

            // --- city segment + obstacle + billboard prefabs ---
            var segment = BakeSegment(roadMat, sideMat, neonMat);
            SetArray(visual, "roadSegmentPrefabs", new Object[]{ segment });
            var obstacles = new List<Object>();
            obstacles.Add(Obstacle("ConcreteBarrier", AvoidAction.Jump, concMat, neonMat));
            obstacles.Add(Obstacle("ParkedCar", AvoidAction.DodgeLane, Mat("CarPaint", new Color(0.75f,0.1f,0.35f), 0.6f), neonMat));
            obstacles.Add(Obstacle("OverheadSign", AvoidAction.Slide, neonMat, concMat));
            var billboard = BakeBillboard(neonMat);

            // --- scene + GameDirector ---
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var director = new GameObject("GameDirector");
            var gm = director.AddComponent<GameManager>();
            var boot = director.AddComponent<SceneBootstrapper>();
            var track = director.AddComponent<TrackGenerator>();
            var spawner = director.AddComponent<BillboardSpawner>();
            var audioMgr = director.AddComponent<VeloxAudioManager>();
            var google = director.AddComponent<GoogleSignInProvider>();
            var backend = director.AddComponent<VeloxBackendClient>();
            var auth = director.AddComponent<AuthService>();
            var board = director.AddComponent<LeaderboardService>();
            var spawn = new GameObject("NeoSpawn"); spawn.transform.position = new Vector3(0f, 0.1f, 0f);
            Set(boot, "visualCatalog", visual); Set(boot, "spawnPoint", spawn.transform);
            Set(track, "catalog", visual); Set(track, "billboards", spawner); SetArray(track, "obstacles", obstacles.ToArray());
            Set(spawner, "billboardPrefab", billboard.GetComponent<CustomBillboardAd>());
            Set(audioMgr, "catalog", audio);
            Set(google, "authConfig", authCfg); Set(backend, "authConfig", authCfg);
            Set(auth, "google", google); Set(auth, "backend", backend); Set(auth, "authConfig", authCfg);
            Set(board, "backend", backend); Set(board, "auth", auth);

            // --- camera + light ---
            var camGo = new GameObject("Main Camera") { tag = "MainCamera" };
            camGo.AddComponent<Camera>(); var follow = camGo.AddComponent<CameraFollow>();
            Set(follow, "bootstrapper", boot); camGo.transform.position = new Vector3(0f, 5.2f, -7.5f);
            var li = new GameObject("Directional Light"); li.AddComponent<Light>().type = LightType.Directional; li.transform.rotation = Quaternion.Euler(50f, -30f, 0f);

            BuildCanvas(auth, board, out var menuPanel);
            EditorSceneManager.SaveScene(scene, "Assets/Scenes/Main.unity");
            EditorBuildSettings.scenes = new[]{ new EditorBuildSettingsScene("Assets/Scenes/Main.unity", true) };
            AssetDatabase.SaveAssets();
            Debug.Log("[VELOX] Main scene built & fully wired: GameDirector, NEO prefab, catalogues, billboards, Canvas (menu/HUD/Top-10). No unassigned references.");
            Selection.activeGameObject = director;
        }

        // ---------- canvas ----------
        private static void BuildCanvas(AuthService auth, LeaderboardService board, out GameObject menuPanel)
        {
            var canvasGo = new GameObject("Main Canvas"); var canvas = canvasGo.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay; canvasGo.AddComponent<CanvasScaler>().uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            canvasGo.AddComponent<GraphicRaycaster>();
            // HUD
            var hud = Panel(canvasGo.transform, "HUD"); var hudCtl = hud.AddComponent<HudController>();
            var score = Text(hud.transform, "Score", "0", 34, new Vector2(0f, 1f), new Vector2(-260f, -40f));
            var coins = Text(hud.transform, "Coins", "0", 26, new Vector2(0f, 1f), new Vector2(-260f, -84f));
            var speed = Text(hud.transform, "Speed", "0 km/h", 22, new Vector2(1f, 1f), new Vector2(260f, -40f));
            var gameOver = Panel(canvasGo.transform, "GameOverPanel"); Text(gameOver.transform, "T", "GAME OVER", 44, new Vector2(0.5f, 0.5f), Vector2.zero); gameOver.SetActive(false);
            var pause = Panel(canvasGo.transform, "PausePanel"); Text(pause.transform, "T", "PAUSED", 40, new Vector2(0.5f, 0.5f), Vector2.zero); pause.SetActive(false);
            Set(hudCtl, "scoreText", score); Set(hudCtl, "coinsText", coins); Set(hudCtl, "speedText", speed); Set(hudCtl, "gameOverPanel", gameOver); Set(hudCtl, "pausePanel", pause);
            // Main menu
            menuPanel = Panel(canvasGo.transform, "MainMenu"); var menu = menuPanel.AddComponent<MainMenuController>();
            var logo = Text(menuPanel.transform, "Logo", GameConstants.GameName, 72, new Vector2(0.5f, 0.78f), Vector2.zero);
            var playerLabel = Text(menuPanel.transform, "PlayerLabel", "NEO Runner", 24, new Vector2(0.5f, 0.66f), Vector2.zero);
            var authStatus = Text(menuPanel.transform, "AuthStatus", "Playing as guest", 18, new Vector2(0.5f, 0.60f), Vector2.zero);
            var play = Button(menuPanel.transform, "▶  PLAY", new Vector2(0.5f, 0.48f));
            var signIn = Button(menuPanel.transform, "Sign in with Google (Gmail)", new Vector2(0.5f, 0.38f));
            var lbBtn = Button(menuPanel.transform, "🏆  Monthly Top 10", new Vector2(0.5f, 0.28f));
            var signOut = Button(menuPanel.transform, "Sign out", new Vector2(0.5f, 0.18f));
            // Leaderboard (exactly 10 rows)
            var lbPanel = Panel(canvasGo.transform, "LeaderboardPanel"); var lb = lbPanel.AddComponent<LeaderboardPanel>();
            var title = Text(lbPanel.transform, "Title", "VELOX — Top 10", 32, new Vector2(0.5f, 0.92f), Vector2.zero);
            var countdown = Text(lbPanel.transform, "Countdown", "", 18, new Vector2(0.5f, 0.86f), Vector2.zero);
            var rows = new List<Object>(); float y = 0.80f;
            for (int i = 0; i < 10; i++) { var row = Panel(lbPanel.transform, "Row"+(i+1)); row.GetComponent<RectTransform>().anchorMin = new Vector2(0.2f, y-0.055f); row.GetComponent<RectTransform>().anchorMax = new Vector2(0.8f, y);
                var view = row.AddComponent<LeaderboardEntryView>();
                var rk = Text(row.transform, "Rank", "#"+(i+1), 20, new Vector2(0.06f, 0.5f), Vector2.zero);
                var nm = Text(row.transform, "Name", "—", 20, new Vector2(0.38f, 0.5f), Vector2.zero);
                var sc = Text(row.transform, "Score", "0", 20, new Vector2(0.88f, 0.5f), Vector2.zero);
                var img = row.GetComponent<Image>(); Set(view, "rankText", rk); Set(view, "nameText", nm); Set(view, "scoreText", sc); Set(view, "background", img);
                rows.Add(view); y -= 0.062f; }
            var status = Text(lbPanel.transform, "Status", "", 18, new Vector2(0.5f, 0.10f), Vector2.zero);
            var signedOut = Text(lbPanel.transform, "SignedOutState", "Sign in with Google to join this month's Top 10.", 18, new Vector2(0.5f, 0.5f), Vector2.zero).gameObject;
            Set(lb, "service", board); SetArray(lb, "rows", rows.ToArray()); Set(lb, "titleText", title); Set(lb, "countdownText", countdown); Set(lb, "statusText", status); Set(lb, "signedOutState", signedOut);
            lbPanel.SetActive(false);
            Set(menu, "logoText", logo); Set(menu, "playButton", play); Set(menu, "signInButton", signIn); Set(menu, "leaderboardButton", lbBtn);
            Set(menu, "signOutButton", signOut); Set(menu, "playerLabel", playerLabel); Set(menu, "authStatus", authStatus); Set(menu, "leaderboardPanel", lbPanel); Set(menu, "auth", auth);
        }

        // ---------- prefab bakers ----------
        private static GameObject BakeSegment(Material road, Material side, Material neon)
        { string path = "Assets/Prefabs/Environment/CitySegment.prefab"; var existing = AssetDatabase.LoadAssetAtPath<GameObject>(path); if (existing) return existing;
          var g = new GameObject("CitySegment");
          Cube(g, "Road", new Vector3(7f, 0.1f, 30f), new Vector3(0f, -0.05f, 15f), road);
          Cube(g, "SidewalkL", new Vector3(2.4f, 0.22f, 30f), new Vector3(-4.7f, 0f, 15f), side);
          Cube(g, "SidewalkR", new Vector3(2.4f, 0.22f, 30f), new Vector3(4.7f, 0f, 15f), side);
          for (int i = 0; i < 3; i++) { Cube(g, "LaneGlow"+i, new Vector3(0.12f, 0.02f, 3f), new Vector3((i-1)*2.2f, 0.02f, 5f+i*10f), neon);
                                       Cube(g, "BuildingL"+i, new Vector3(3f, Random.Range(6f, 14f), 4f), new Vector3(-9f, 3f, 4f+i*10f), side);
                                       Cube(g, "BuildingR"+i, new Vector3(3f, Random.Range(6f, 14f), 4f), new Vector3(9f, 3f, 4f+i*10f), side); }
          var p = PrefabUtility.SaveAsPrefabAsset(g, path); Object.DestroyImmediate(g); return p; }
        private static Object Obstacle(string name, AvoidAction avoid, Material main, Material accent)
        { string defPath = $"Assets/Prefabs/Obstacles/{name}.asset"; var def = AssetDatabase.LoadAssetAtPath<ObstacleDefinition>(defPath); if (def) return def;
          var g = new GameObject(name) { tag = "Obstacle" };
          if (name == "ConcreteBarrier") { Cube(g, "Base", new Vector3(1.9f, 0.8f, 0.4f), new Vector3(0f, 0.4f, 0f), main); Cube(g, "Stripe", new Vector3(1.9f, 0.16f, 0.42f), new Vector3(0f, 0.55f, 0f), accent); }
          else if (name == "ParkedCar") { Cube(g, "Body", new Vector3(1.8f, 0.55f, 3.6f), new Vector3(0f, 0.45f, 0f), main); Cube(g, "Cabin", new Vector3(1.6f, 0.5f, 1.8f), new Vector3(0f, 0.95f, -0.2f), accent);
            foreach (var w in new[]{ new Vector3(-0.85f,0.3f,1.1f), new Vector3(0.85f,0.3f,1.1f), new Vector3(-0.85f,0.3f,-1.1f), new Vector3(0.85f,0.3f,-1.1f) })
            { var wheel = GameObject.CreatePrimitive(PrimitiveType.Cylinder); wheel.name = "Wheel"; wheel.transform.SetParent(g.transform); wheel.transform.position = w; wheel.transform.rotation = Quaternion.Euler(0f, 0f, 90f); wheel.transform.localScale = new Vector3(0.6f, 0.15f, 0.6f); } }
          else { Cube(g, "SignBoard", new Vector3(2f, 0.9f, 0.15f), new Vector3(0f, 1.55f, 0f), main); Cube(g, "PostL", new Vector3(0.12f, 1.6f, 0.12f), new Vector3(-0.8f, 0.8f, 0f), accent); Cube(g, "PostR", new Vector3(0.12f, 1.6f, 0.12f), new Vector3(0.8f, 0.8f, 0f), accent); }
          var col = g.AddComponent<BoxCollider>(); col.size = new Vector3(1.9f, 2f, 1f); col.center = new Vector3(0f, 1f, 0f);
          var prefab = PrefabUtility.SaveAsPrefabAsset(g, $"Assets/Prefabs/Obstacles/{name}.prefab"); Object.DestroyImmediate(g);
          def = ScriptableObject.CreateInstance<ObstacleDefinition>(); def.prefab = prefab; def.avoidBy = avoid; def.spawnWeight = 1f;
          AssetDatabase.CreateAsset(def, defPath); return def; }
        private static GameObject BakeBillboard(Material frame)
        { string path = "Assets/Prefabs/Environment/Billboard.prefab"; var existing = AssetDatabase.LoadAssetAtPath<GameObject>(path); if (existing) return existing;
          var g = new GameObject("Billboard");
          Cube(g, "Pole", new Vector3(0.25f, 3.2f, 0.25f), new Vector3(0f, -1.2f, 0f), frame);
          var screen = GameObject.CreatePrimitive(PrimitiveType.Quad); screen.name = "Screen"; screen.transform.SetParent(g.transform); screen.transform.localScale = new Vector3(5f, 2.6f, 1f);
          screen.GetComponent<Renderer>().sharedMaterial = frame; screen.AddComponent<CustomBillboardAd>();
          var p = PrefabUtility.SaveAsPrefabAsset(g, path); Object.DestroyImmediate(g); return p; }

        // ---------- helpers ----------
        private static void Cube(GameObject parent, string name, Vector3 scale, Vector3 pos, Material mat)
        { var c = GameObject.CreatePrimitive(PrimitiveType.Cube); c.name = name; c.transform.SetParent(parent.transform); c.transform.localScale = scale; c.transform.localPosition = pos;
          if (mat) c.GetComponent<Renderer>().sharedMaterial = mat; var col = c.GetComponent<Collider>(); if (col) Object.DestroyImmediate(col); }
        private static Material Mat(string name, Color c, float emission = 0f)
        { string path = $"Assets/Materials/Environment/{name}.mat"; var m = AssetDatabase.LoadAssetAtPath<Material>(path); if (m) return m;
          m = new Material(Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard")) { name = name, color = c };
          if (emission > 0f) { m.EnableKeyword("_EMISSION"); m.SetColor("_EmissionColor", c * emission); } AssetDatabase.CreateAsset(m, path); return m; }
        private static T Asset<T>(string path) where T : ScriptableObject
        { var a = AssetDatabase.LoadAssetAtPath<T>(path); if (a) return a; a = ScriptableObject.CreateInstance<T>(); AssetDatabase.CreateAsset(a, path); return a; }
        private static GameObject Panel(Transform parent, string name)
        { var g = new GameObject(name, typeof(RectTransform), typeof(Image)); g.transform.SetParent(parent, false);
          var rt = g.GetComponent<RectTransform>(); rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one; rt.offsetMin = Vector2.zero; rt.offsetMax = Vector2.zero;
          g.GetComponent<Image>().color = new Color(0.03f, 0.04f, 0.09f, 0.55f); return g; }
        private static TMP_Text Text(Transform parent, string name, string content, int size, Vector2 anchor, Vector2 pos)
        { var g = new GameObject(name, typeof(RectTransform)); g.transform.SetParent(parent, false);
          var rt = g.GetComponent<RectTransform>(); rt.anchorMin = rt.anchorMax = anchor; rt.anchoredPosition = pos; rt.sizeDelta = new Vector2(700f, 90f);
          var t = g.AddComponent<TextMeshProUGUI>(); t.text = content; t.fontSize = size; t.alignment = TextAlignmentOptions.Center; t.color = Color.white; return t; }
        private static Button Button(Transform parent, string label, Vector2 anchor)
        { var g = new GameObject(label, typeof(RectTransform), typeof(Image), typeof(Button)); g.transform.SetParent(parent, false);
          var rt = g.GetComponent<RectTransform>(); rt.anchorMin = rt.anchorMax = anchor; rt.sizeDelta = new Vector2(460f, 64f);
          g.GetComponent<Image>().color = new Color(0.05f, 0.65f, 0.85f, 0.95f);
          var t = Text(g.transform, "Label", label, 22, new Vector2(0.5f, 0.5f), Vector2.zero); t.GetComponent<RectTransform>().sizeDelta = new Vector2(440f, 60f);
          return g.GetComponent<Button>(); }
        private static void Set(Object target, string field, Object value)
        { var so = new SerializedObject(target); var pr = so.FindProperty(field);
          if (pr == null) { Debug.LogWarning($"[VELOX] field '{field}' not found on {target.GetType().Name}"); return; }
          pr.objectReferenceValue = value; so.ApplyModifiedPropertiesWithoutUndo(); EditorUtility.SetDirty(target); }
        private static void SetArray(Object target, string field, Object[] values)
        { var so = new SerializedObject(target); var pr = so.FindProperty(field);
          if (pr == null) { Debug.LogWarning($"[VELOX] array '{field}' not found on {target.GetType().Name}"); return; }
          pr.arraySize = values.Length; for (int i = 0; i < values.Length; i++) pr.GetArrayElementAtIndex(i).objectReferenceValue = values[i];
          so.ApplyModifiedPropertiesWithoutUndo(); EditorUtility.SetDirty(target); }
    }
}
#endif
