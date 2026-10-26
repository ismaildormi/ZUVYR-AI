// ============================================================================
// VELOX — procedural scene builder (Editor only).
//
// Builds a complete, playable VELOX scene from code with NO required art
// assets: camera, lights, the NEO runner, a procedural scrolling track,
// obstacles/coins/billboards/decorations, and a fully wired UI (menu, HUD,
// pause, game-over, leaderboard). Saves it to Assets/Scenes/VELOX.unity and
// registers it in Build Settings.
//
// Run via: VELOX ▸ Build Playable Scene.
// Safe to re-run: it always rebuilds the scene from scratch.
//
// Button onClick wiring is intentionally left to GameUI.Bind /
// LeaderboardManager.Bind (called by GameDirector.Start at runtime); this
// builder only creates the GameObjects and assigns the serialized references.
// ============================================================================
using System;
using TMPro;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UI;
using VELOX.Backend;
using VELOX.Core;
using VELOX.Gameplay;
using VELOX.UI;
using VELOX.Visuals;

namespace VELOX.Editor
{
    public static class VeloxSceneBuilder
    {
        private const string ScenePath = "Assets/Scenes/VELOX.unity";
        private const string CatalogPath = "Assets/Resources/VisualCatalog.asset";

        private static Sprite _whiteSprite;

        [MenuItem("VELOX/Build Playable Scene")]
        public static void BuildScene()
        {
            try
            {
                Build();
                if (Application.isBatchMode)
                {
                    // No GUI dialogs in batch mode; log for the log file.
                    Debug.Log("[VELOX] Playable scene built: " + ScenePath);
                    return;
                }
                EditorUtility.DisplayDialog("VELOX",
                    "Playable scene built and saved to:\n" + ScenePath, "OK");
            }
            catch (Exception e)
            {
                Debug.LogError("[VELOX] Scene build failed: " + e);
                if (!Application.isBatchMode)
                    EditorUtility.DisplayDialog("VELOX", "Scene build failed:\n" + e.Message, "OK");
                // In batch mode, rethrow so the -batchmode process exits non-zero.
                if (Application.isBatchMode) throw;
            }
        }

        /// <summary>
        /// Batch-mode entry point for Unity -executeMethod. Calls the SAME
        /// Build() as the menu item (no duplicate logic), then validates the
        /// scene was saved and registered in build settings. Rethrows on
        /// failure so the batch process exits non-zero.
        /// </summary>
        public static void GenerateSceneForBatch()
        {
            BuildScene();
            if (!ValidateSceneForBatch())
                throw new System.Exception(
                    "VELOX scene validation failed: scene file missing or not registered in build settings.");
        }

        /// <summary>Validates the scene file exists and is registered in
        /// EditorBuildSettings.scenes. Returns true on success.</summary>
        public static bool ValidateSceneForBatch()
        {
            string absPath = System.IO.Path.Combine(Application.dataPath, "Scenes/VELOX.unity");
            if (!System.IO.File.Exists(absPath))
            {
                Debug.LogError("[VELOX] Batch validation FAILED: scene file not found: " + absPath);
                return false;
            }

            bool registered = false;
            foreach (var s in EditorBuildSettings.scenes)
            {
                if (s.path == ScenePath) { registered = true; break; }
            }
            if (!registered)
            {
                Debug.LogError("[VELOX] Batch validation FAILED: scene not in EditorBuildSettings.scenes");
                return false;
            }

            Debug.Log("[VELOX] Batch validation OK: scene saved and registered in build settings.");
            return true;
        }

        /// <summary>
        /// Batch-mode entry point to build a standalone player. Output goes to
        /// velox-verify/builds/standalone. Reads VELOX_BUILD_TARGET from the
        /// environment (default StandaloneWindows64). Requires scenes in build
        /// settings (run GenerateSceneForBatch first). Rethrows on failure so
        /// the batch process exits non-zero.
        /// </summary>
        public static void BuildStandaloneBatch()
        {
            string targetStr = System.Environment.GetEnvironmentVariable("VELOX_BUILD_TARGET");
            if (string.IsNullOrEmpty(targetStr)) targetStr = "StandaloneWindows64";

            BuildTarget target;
            if (!System.Enum.TryParse(targetStr, out target))
            {
                Debug.LogError("[VELOX] Invalid VELOX_BUILD_TARGET: " + targetStr);
                if (Application.isBatchMode)
                    throw new System.Exception("Invalid build target: " + targetStr);
                return;
            }

            string outputDir = System.IO.Path.Combine(
                Application.dataPath, "../../velox-verify/builds/standalone");
            System.IO.Directory.CreateDirectory(outputDir);

            string outputPath = System.IO.Path.Combine(outputDir, "VeloxStandalone");
            // Extension must match the REQUESTED build target, not the host platform.
            // Using #if UNITY_STANDALONE_OSX etc. would produce the wrong extension
            // when cross-building (e.g. building OSX from a Windows host).
            switch (target)
            {
                case BuildTarget.StandaloneOSX:
                    outputPath += ".app";
                    break;
                case BuildTarget.StandaloneLinux64:
                    outputPath += ".x86_64";
                    break;
                default:
                    outputPath += ".exe";
                    break;
            }

            string result = BuildPipeline.BuildPlayer(outputPath, target, BuildOptions.None);
            if (string.IsNullOrEmpty(result))
            {
                Debug.Log("[VELOX] Standalone build succeeded: " + outputPath);
            }
            else
            {
                Debug.LogError("[VELOX] Standalone build failed: " + result);
                if (Application.isBatchMode)
                    throw new System.Exception("Build failed: " + result);
            }
        }

        private static void Build()
        {
            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            VisualCatalog catalog = EnsureCatalog();

            CreateCamera();
            CreateLights();
            GameObject trackGo = CreateTrack(catalog);
            GameObject runnerGo = CreateRunner(trackGo.GetComponent<TrackWorld>());

            GameObject gameGo = new GameObject("VELOXGame");
            GameDirector director = gameGo.AddComponent<GameDirector>();
            AccountSession account = gameGo.AddComponent<AccountSession>();
            account.firebaseConfig = new FirebaseConfig();
            account.firebaseConfig.enabled = false;
            account.googleWebClientId = string.Empty;

            LeaderboardManager leaderboard = gameGo.AddComponent<LeaderboardManager>();
            MonthlyLeaderboardReset monthlyReset = gameGo.AddComponent<MonthlyLeaderboardReset>();
            monthlyReset.manager = leaderboard;

            CreateUI(leaderboard, out GameUI gameUI);

            director.runner = runnerGo.GetComponent<RunnerMotor>();
            director.trackWorld = trackGo.GetComponent<TrackWorld>();
            director.gameUI = gameUI;
            director.leaderboardManager = leaderboard;
            director.accountSession = account;
            director.visualCatalog = catalog;

            EnsureScenesFolder();

            // Back up an existing scene before overwriting. The new scene is
            // regenerated from code, but we preserve the previous version
            // (non-destructive: never silently discard).
            string absScene = System.IO.Path.Combine(Application.dataPath, "Scenes/VELOX.unity");
            if (System.IO.File.Exists(absScene))
            {
                string backup = absScene + ".bak-" +
                    System.DateTime.UtcNow.ToString("yyyyMMdd-HHmmss");
                System.IO.File.Copy(absScene, backup);
                Debug.LogWarning("[VELOX] Existing scene backed up to " + backup);
            }

            if (!EditorSceneManager.SaveScene(scene, ScenePath))
            {
                Debug.LogError("[VELOX] Failed to save scene to " + ScenePath);
                return;
            }

            EditorBuildSettings.scenes = new[] { new EditorBuildSettings.Scene(ScenePath, true) };
            AssetDatabase.Refresh();
            Debug.Log("[VELOX] Playable scene built: " + ScenePath);
        }

        // ---------------------------------------------------------------------
        // World objects
        // ---------------------------------------------------------------------

        private static GameObject CreateCamera()
        {
            GameObject go = new GameObject("MainCamera");
            go.tag = "MainCamera";
            Camera cam = go.AddComponent<Camera>();
            cam.fieldOfView = 60f;
            cam.nearClipPlane = 0.3f;
            cam.farClipPlane = 400f;
            go.transform.position = new Vector3(0f, 4.5f, -10f);
            go.transform.LookAt(new Vector3(0f, 1f, 16f));
            return go;
        }

        private static GameObject CreateLights()
        {
            GameObject go = new GameObject("Lights");
            Light dir = go.AddComponent<Light>();
            dir.type = LightType.Directional;
            dir.shadows = LightShadows.Soft;
            dir.transform.position = new Vector3(12f, 22f, 8f);
            dir.transform.LookAt(Vector3.zero);

            RenderSettings.ambientLight = new Color(0.45f, 0.47f, 0.52f, 1f);
            RenderSettings.fog = false;
            return go;
        }

        private static GameObject CreateTrack(VisualCatalog catalog)
        {
            GameObject go = new GameObject("TrackWorld");
            TrackWorld track = go.AddComponent<TrackWorld>();
            track.lanes = 3;
            track.laneWidth = 2f;
            track.segmentLength = 10f;
            track.spawnAhead = 60f;
            track.recycleBehind = -12f;
            track.useCatalog = false;          // procedural visuals
            track.catalog = catalog;           // assigned for future re-skinning
            return go;
        }

        private static GameObject CreateRunner(TrackWorld track)
        {
            GameObject go = new GameObject("Runner");
            go.transform.position = new Vector3(0f, 0.15f, 0f);

            RunnerMotor motor = go.AddComponent<RunnerMotor>();
            motor.trackWorld = track;

            GameObject visual = ProceduralVisuals.MakeRunnerVisual();
            visual.transform.SetParent(go.transform);
            visual.transform.localPosition = new Vector3(0f, 0.9f, 0f);
            return go;
        }

        // ---------------------------------------------------------------------
        // UI
        // ---------------------------------------------------------------------

        private static GameObject CreateUI(LeaderboardManager leaderboard, out GameUI gameUI)
        {
            GameObject uiRoot = new GameObject("UI");

            GameObject canvasGo = new GameObject("Canvas");
            canvasGo.transform.SetParent(uiRoot.transform);
            Canvas canvas = canvasGo.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;

            CanvasScaler scaler = canvasGo.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920f, 1080f);

            canvasGo.AddComponent<GraphicRaycaster>();

            GameObject uiGo = new GameObject("GameUI");
            uiGo.transform.SetParent(uiRoot.transform);
            gameUI = uiGo.AddComponent<GameUI>();

            BuildMenu(canvas, gameUI);
            BuildHud(canvas, gameUI);
            BuildPause(canvas, gameUI);
            BuildGameOver(canvas, gameUI);
            BuildLeaderboard(canvas, leaderboard);

            return uiRoot;
        }

        private static void BuildMenu(Canvas canvas, GameUI ui)
        {
            GameObject panel = MakePanel(canvas.transform, "MenuPanel",
                new Color(0.08f, 0.09f, 0.13f, 0.92f), new Vector2(440f, 480f));
            ui.menuPanel = panel;

            ui.gameNameText = MakeText(panel.transform, GameIdentity.GameName, 56f, Color.white,
                TextAlignmentOptions.Center);
            ui.characterNameText = MakeText(panel.transform, "NEO · Endless Runner", 22f,
                new Color(0.7f, 0.8f, 1f, 1f), TextAlignmentOptions.Center);

            ui.startButton = MakeButton(panel.transform, "START",
                new Color(0.2f, 0.55f, 0.95f, 1f));
            ui.loginButton = MakeButton(panel.transform, "SIGN IN WITH GOOGLE",
                new Color(0.85f, 0.55f, 0.2f, 1f));
            ui.leaderboardButton = MakeButton(panel.transform, "LEADERBOARD",
                new Color(0.3f, 0.3f, 0.35f, 1f));
            ui.quitButton = MakeButton(panel.transform, "QUIT",
                new Color(0.3f, 0.2f, 0.2f, 1f));

            ui.loginStatusText = MakeText(panel.transform, "Offline mode", 16f,
                new Color(0.6f, 0.6f, 0.6f, 1f), TextAlignmentOptions.Center);
            ui.bestMenuText = MakeText(panel.transform, "BEST  0", 18f,
                new Color(1f, 0.85f, 0.3f, 1f), TextAlignmentOptions.Center);
        }

        private static void BuildHud(Canvas canvas, GameUI ui)
        {
            GameObject panel = MakeHudPanel(canvas.transform);
            ui.hudPanel = panel;

            ui.scoreText = MakeText(panel.transform, "0", 32f, Color.white,
                TextAlignmentOptions.Center);
            ui.bestText = MakeText(panel.transform, "BEST 0", 18f,
                new Color(1f, 0.85f, 0.3f, 1f), TextAlignmentOptions.Center);
            ui.coinsText = MakeText(panel.transform, "0", 22f,
                new Color(1f, 0.84f, 0.2f, 1f), TextAlignmentOptions.Center);
            ui.speedText = MakeText(panel.transform, "0", 18f,
                new Color(0.7f, 0.8f, 1f, 1f), TextAlignmentOptions.Center);

            GameObject pauseGo = new GameObject("PauseButton");
            pauseGo.transform.SetParent(panel.transform);
            RectTransform prt = pauseGo.AddComponent<RectTransform>();
            prt.anchorMin = new Vector2(1f, 0.5f);
            prt.anchorMax = new Vector2(1f, 0.5f);
            prt.pivot = new Vector2(1f, 0.5f);
            prt.anchoredPosition = new Vector2(-20f, 0f);
            prt.sizeDelta = new Vector2(70f, 46f);
            Image pi = pauseGo.AddComponent<Image>();
            pi.sprite = WhiteSprite();
            pi.color = new Color(0.25f, 0.25f, 0.3f, 0.9f);
            pi.raycastTarget = true;
            Button pb = pauseGo.AddComponent<Button>();
            MakeText(pauseGo.transform, "II", 24f, Color.white, TextAlignmentOptions.Center);
            ui.pauseButton = pb;
        }

        private static void BuildPause(Canvas canvas, GameUI ui)
        {
            GameObject panel = MakePanel(canvas.transform, "PausePanel",
                new Color(0.08f, 0.09f, 0.13f, 0.92f), new Vector2(360f, 220f));
            ui.pausePanel = panel;

            MakeText(panel.transform, "PAUSED", 40f, Color.white, TextAlignmentOptions.Center);
            ui.resumeButton = MakeButton(panel.transform, "RESUME",
                new Color(0.2f, 0.55f, 0.95f, 1f));
            ui.pauseQuitButton = MakeButton(panel.transform, "QUIT TO MENU",
                new Color(0.3f, 0.2f, 0.2f, 1f));
        }

        private static void BuildGameOver(Canvas canvas, GameUI ui)
        {
            GameObject panel = MakePanel(canvas.transform, "GameOverPanel",
                new Color(0.10f, 0.06f, 0.08f, 0.95f), new Vector2(440f, 440f));
            ui.gameOverPanel = panel;

            MakeText(panel.transform, "GAME OVER", 44f, Color.white, TextAlignmentOptions.Center);
            ui.gameOverScoreText = MakeText(panel.transform, "SCORE  0", 28f,
                new Color(1f, 0.85f, 0.3f, 1f), TextAlignmentOptions.Center);
            ui.gameOverBestText = MakeText(panel.transform, "BEST  0", 20f,
                Color.white, TextAlignmentOptions.Center);
            ui.gameOverRankText = MakeText(panel.transform, "RANK  —", 20f,
                new Color(0.7f, 0.8f, 1f, 1f), TextAlignmentOptions.Center);

            ui.restartButton = MakeButton(panel.transform, "RESTART",
                new Color(0.2f, 0.7f, 0.35f, 1f));
            ui.gameOverLeaderboardButton = MakeButton(panel.transform, "LEADERBOARD",
                new Color(0.3f, 0.3f, 0.35f, 1f));
            ui.gameOverQuitButton = MakeButton(panel.transform, "QUIT",
                new Color(0.3f, 0.2f, 0.2f, 1f));
        }

        private static void BuildLeaderboard(Canvas canvas, LeaderboardManager lb)
        {
            GameObject panel = new GameObject("LeaderboardPanel");
            panel.transform.SetParent(canvas.transform);
            RectTransform rt = panel.AddComponent<RectTransform>();
            rt.anchorMin = new Vector2(0.5f, 0.5f);
            rt.anchorMax = new Vector2(0.5f, 0.5f);
            rt.pivot = new Vector2(0.5f, 0.5f);
            rt.anchoredPosition = Vector2.zero;
            rt.sizeDelta = new Vector2(460f, 620f);
            Image bg = panel.AddComponent<Image>();
            bg.sprite = WhiteSprite();
            bg.color = new Color(0.08f, 0.09f, 0.13f, 0.95f);
            bg.raycastTarget = false;

            lb.leaderboardPanel = panel;

            TMP_Text title = MakeText(panel.transform, GameIdentity.GameName + " — TOP 10",
                28f, Color.white, TextAlignmentOptions.Center);
            title.rectTransform.anchorMin = new Vector2(0f, 1f);
            title.rectTransform.anchorMax = new Vector2(1f, 1f);
            title.rectTransform.anchoredPosition = new Vector2(0f, -210f);
            title.rectTransform.sizeDelta = new Vector2(0f, 40f);
            lb.titleText = title;

            TMP_Text month = MakeText(panel.transform, "Monthly Standings", 16f,
                new Color(0.6f, 0.6f, 0.6f, 1f), TextAlignmentOptions.Center);
            month.rectTransform.anchorMin = new Vector2(0f, 1f);
            month.rectTransform.anchorMax = new Vector2(1f, 1f);
            month.rectTransform.anchoredPosition = new Vector2(0f, -175f);
            month.rectTransform.sizeDelta = new Vector2(0f, 26f);
            lb.monthText = month;

            GameObject topRight = new GameObject("TopRight");
            topRight.transform.SetParent(panel.transform);
            RectTransform trt = topRight.AddComponent<RectTransform>();
            trt.anchorMin = new Vector2(1f, 1f);
            trt.anchorMax = new Vector2(1f, 1f);
            trt.pivot = new Vector2(1f, 1f);
            trt.anchoredPosition = new Vector2(-16f, -150f);
            trt.sizeDelta = new Vector2(150f, 40f);
            HorizontalLayoutGroup th = topRight.AddComponent<HorizontalLayoutGroup>();
            th.spacing = 8f;
            th.childAlignment = TextAnchor.MiddleRight;

            Button closeBtn = MakeButton(topRight.transform, "CLOSE",
                new Color(0.4f, 0.2f, 0.2f, 1f));
            closeBtn.GetComponent<RectTransform>().sizeDelta = new Vector2(80f, 36f);
            Button refreshBtn = MakeButton(topRight.transform, "REFRESH",
                new Color(0.2f, 0.4f, 0.6f, 1f));
            refreshBtn.GetComponent<RectTransform>().sizeDelta = new Vector2(80f, 36f);
            lb.closeButton = closeBtn;
            lb.refreshButton = refreshBtn;

            GameObject rowsGo = new GameObject("RowsContainer");
            rowsGo.transform.SetParent(panel.transform);
            RectTransform rowsRt = rowsGo.AddComponent<RectTransform>();
            rowsRt.anchorMin = new Vector2(0f, 0.5f);
            rowsRt.anchorMax = new Vector2(1f, 0.5f);
            rowsRt.pivot = new Vector2(0.5f, 0.5f);
            rowsRt.anchoredPosition = new Vector2(0f, -30f);
            rowsRt.sizeDelta = new Vector2(412f, 260f);
            VerticalLayoutGroup rowsVl = rowsGo.AddComponent<VerticalLayoutGroup>();
            rowsVl.padding = new RectOffset(12, 12, 8, 8);
            rowsVl.spacing = 6f;
            rowsVl.childAlignment = TextAnchor.MiddleCenter;
            rowsVl.controlChildSize = false;
            lb.rowsContainer = rowsGo.transform;

            GameObject rowPrefab = CreateRowPrefab();
            rowPrefab.transform.SetParent(panel.transform);
            rowPrefab.SetActive(false);
            lb.rowPrefab = rowPrefab.GetComponent<LeaderboardRow>();

            GameObject emptyRow = new GameObject("EmptyRow");
            emptyRow.transform.SetParent(panel.transform);
            RectTransform ert = emptyRow.AddComponent<RectTransform>();
            ert.anchorMin = Vector2.zero;
            ert.anchorMax = Vector2.one;
            ert.sizeDelta = Vector2.zero;
            MakeText(emptyRow.transform, "No entries yet", 18f,
                new Color(0.5f, 0.5f, 0.5f, 1f), TextAlignmentOptions.Center);
            lb.emptyRow = emptyRow;
        }

        private static GameObject CreateRowPrefab()
        {
            GameObject go = new GameObject("RowPrefab");
            RectTransform rt = go.AddComponent<RectTransform>();
            rt.sizeDelta = new Vector2(412f, 40f);
            HorizontalLayoutGroup hl = go.AddComponent<HorizontalLayoutGroup>();
            hl.padding = new RectOffset(16, 16, 4, 4);
            hl.spacing = 12f;
            hl.childAlignment = TextAnchor.MiddleLeft;
            hl.controlChildSize = false;

            LeaderboardRow row = go.AddComponent<LeaderboardRow>();

            TMP_Text rank = MakeFixedText(go.transform, "01", 20f, Color.white,
                TextAlignmentOptions.Left, new Vector2(56f, 32f));

            TMP_Text name = MakeFixedText(go.transform, "NAME", 20f, Color.white,
                TextAlignmentOptions.Left, new Vector2(190f, 32f));

            TMP_Text score = MakeFixedText(go.transform, "000000", 20f, Color.white,
                TextAlignmentOptions.Right, new Vector2(90f, 32f));

            GameObject hi = new GameObject("Highlight");
            hi.transform.SetParent(go.transform);
            Image hiImg = hi.AddComponent<Image>();
            hiImg.sprite = WhiteSprite();
            hiImg.color = new Color(1f, 0.9f, 0.3f, 0.25f);
            hiImg.raycastTarget = false;
            RectTransform hrt = hi.AddComponent<RectTransform>();
            hrt.anchorMin = Vector2.zero;
            hrt.anchorMax = Vector2.one;
            hrt.sizeDelta = Vector2.zero;
            // Full-row background: opt the highlight OUT of the row's
            // HorizontalLayoutGroup (ignoreLayout=true) so its stretch-to-parent
            // rect stays anchored at the row origin instead of being offset to
            // the far right (by the rank/name/score preferred widths) and
            // rendered mostly off-screen.
            LayoutElement le = hi.AddComponent<LayoutElement>();
            le.ignoreLayout = true;

            row.rankText = rank;
            row.nameText = name;
            row.scoreText = score;
            row.highlight = hiImg;
            return go;
        }

        // ---------------------------------------------------------------------
        // UI helpers
        // ---------------------------------------------------------------------

        private static Sprite WhiteSprite()
        {
            if (_whiteSprite != null) return _whiteSprite;
            Texture2D tex = new Texture2D(2, 2, TextureFormat.RGBA32, false);
            tex.SetPixel(0, 0, Color.white);
            tex.SetPixel(1, 0, Color.white);
            tex.SetPixel(0, 1, Color.white);
            tex.SetPixel(1, 1, Color.white);
            tex.Apply();
            _whiteSprite = Sprite.Create(tex, new Rect(0, 0, 2, 2), new Vector2(0.5f, 0.5f));
            return _whiteSprite;
        }

        private static GameObject MakePanel(Transform parent, string name, Color color, Vector2 size)
        {
            GameObject go = new GameObject(name);
            go.transform.SetParent(parent);
            RectTransform rt = go.AddComponent<RectTransform>();
            rt.anchorMin = new Vector2(0.5f, 0.5f);
            rt.anchorMax = new Vector2(0.5f, 0.5f);
            rt.pivot = new Vector2(0.5f, 0.5f);
            rt.anchoredPosition = Vector2.zero;
            rt.sizeDelta = size;

            Image img = go.AddComponent<Image>();
            img.sprite = WhiteSprite();
            img.color = color;
            img.raycastTarget = false;

            VerticalLayoutGroup vl = go.AddComponent<VerticalLayoutGroup>();
            vl.padding = new RectOffset(24, 24, 18, 18);
            vl.spacing = 10f;
            vl.childAlignment = TextAnchor.LowerCenter;
            vl.controlChildSize = false;

            ContentSizeFitter csf = go.AddComponent<ContentSizeFitter>();
            csf.verticalFit = ContentSizeFitter.FitMode.PreferredSize;
            return go;
        }

        private static GameObject MakeHudPanel(Transform parent)
        {
            GameObject go = new GameObject("HUDPanel");
            go.transform.SetParent(parent);
            RectTransform rt = go.AddComponent<RectTransform>();
            rt.anchorMin = new Vector2(0.5f, 1f);
            rt.anchorMax = new Vector2(0.5f, 1f);
            rt.pivot = new Vector2(0.5f, 0.5f);
            rt.anchoredPosition = new Vector2(0f, -60f);
            rt.sizeDelta = new Vector2(680f, 80f);

            Image img = go.AddComponent<Image>();
            img.sprite = WhiteSprite();
            img.color = new Color(0.1f, 0.1f, 0.12f, 0.55f);
            img.raycastTarget = false;

            HorizontalLayoutGroup hl = go.AddComponent<HorizontalLayoutGroup>();
            hl.padding = new RectOffset(18, 18, 10, 10);
            hl.spacing = 22f;
            hl.childAlignment = TextAnchor.MiddleCenter;
            hl.controlChildSize = false;
            return go;
        }

        private static TMP_Text MakeText(Transform parent, string text, float fontSize,
            Color color, TextAlignmentOptions alignment)
        {
            GameObject go = new GameObject("T");
            go.transform.SetParent(parent);
            RectTransform rt = go.AddComponent<RectTransform>();
            rt.anchorMin = Vector2.zero;
            rt.anchorMax = Vector2.one;
            rt.pivot = new Vector2(0.5f, 0.5f);
            rt.sizeDelta = Vector2.zero;

            TMP_Text t = go.AddComponent<TMP_Text>();
            t.text = text;
            t.fontSize = fontSize;
            t.color = color;
            t.alignment = alignment;
            return t;
        }

        /// <summary>
        /// Like <see cref="MakeText"/> but with NON-stretch anchors
        /// (anchorMin = anchorMax = (0,0)) so the explicit <paramref name="size"/>
        /// actually applies. <see cref="MakeText"/> uses stretch-both anchors
        /// (anchorMin=(0,0), anchorMax=(1,1)) which ignore sizeDelta; for a
        /// fixed-size text slot inside a LayoutGroup (e.g. leaderboard rank /
        /// name / score) the stretch would make each text fill the whole row
        /// and the layout group would offset it, pushing the right-aligned score
        /// off-screen. Non-stretch anchors keep each text at its intended size.
        /// </summary>
        private static TMP_Text MakeFixedText(Transform parent, string text, float fontSize,
            Color color, TextAlignmentOptions alignment, Vector2 size)
        {
            TMP_Text t = MakeText(parent, text, fontSize, color, alignment);
            t.rectTransform.anchorMin = Vector2.zero;
            t.rectTransform.anchorMax = Vector2.zero;
            t.rectTransform.sizeDelta = size;
            return t;
        }

        private static Button MakeButton(Transform parent, string label, Color bg)
        {
            GameObject go = new GameObject("B");
            go.transform.SetParent(parent);
            RectTransform rt = go.AddComponent<RectTransform>();
            rt.anchorMin = Vector2.zero;
            // Stretch width only (anchorMax.x=1) and keep a fixed height
            // (anchorMax.y=0 -> top-anchored, height = sizeDelta.y = 46).
            // Stretching BOTH axes (anchorMax=(1,1)) ignores sizeDelta and makes
            // every button fill the entire parent panel height, so the menu /
            // pause / game-over buttons would all overlap. This is the standard
            // Unity pattern for a full-width fixed-height button in a layout.
            rt.anchorMax = new Vector2(1f, 0f);
            rt.pivot = new Vector2(0.5f, 0.5f);
            rt.sizeDelta = new Vector2(0f, 46f);

            Image img = go.AddComponent<Image>();
            img.sprite = WhiteSprite();
            img.color = bg;
            img.raycastTarget = true;

            Button btn = go.AddComponent<Button>();
            MakeText(go.transform, label, 22f, Color.white, TextAlignmentOptions.Center);
            return btn;
        }

        // ---------------------------------------------------------------------
        // Assets / folders
        // ---------------------------------------------------------------------

        private static VisualCatalog EnsureCatalog()
        {
            VisualCatalog catalog = AssetDatabase.LoadAssetAtPath<VisualCatalog>(CatalogPath);
            if (catalog != null) return catalog;

            if (!AssetDatabase.IsValidFolder("Assets/Resources"))
                AssetDatabase.CreateFolder("Assets", "Resources");

            catalog = ScriptableObject.CreateInstance<VisualCatalog>();
            AssetDatabase.CreateAsset(catalog, CatalogPath);
            AssetDatabase.SaveAssets();
            return catalog;
        }

        private static void EnsureScenesFolder()
        {
            if (!AssetDatabase.IsValidFolder("Assets/Scenes"))
                AssetDatabase.CreateFolder("Assets", "Scenes");
        }
    }
}
