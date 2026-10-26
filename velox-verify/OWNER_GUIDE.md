# VELOX — Unity Build & Verification Guide

This guide lets a project owner with **Unity Editor 2022.3.21f1** installed
run the complete VELOX verification sequence: project compilation, scene
generation, build-settings validation, optional player build, and the
existing test suites.

> **Sandbox note:** The automation was developed and tested in an environment
> where Unity is **not installed**. The shell orchestration, argument
> parsing, exit-code propagation, and validation logic were verified with a
> **mocked Unity executable** (`velox-verify/test/mock-unity.sh`). Native
> Unity compilation, real scene generation, and player builds remain
> **BLOCKED** until Unity is installed on the host.

---

## 1. Prerequisites

| Requirement | Notes |
|---|---|
| Unity Editor **2022.3.21f1** | Matches `ProjectSettings/ProjectVersion.txt`. Other 2022.3.x versions should work but are untested. |
| Node.js (with `node` on PATH) | Required for the Firebase functions tests. |
| The VELOX repo | Branch `arena/7c7abfbb-zuvyr-ai` (or later). |

No Firebase credentials, no network packages, no deployment is required for
the local build/test workflow.

---

## 2. Configure the Unity executable

The script auto-detects Unity from `UNITY_EXE`, `UNITY_ROOT`, or common
install paths. If your Unity is in a non-standard location, set one:

```bash
# Option A: explicit executable
export UNITY_EXE="/path/to/Unity/Unity"

# Option B: install root (script looks for Unity/Unity.exe)
export UNITY_ROOT="/path/to/Unity"
```

Verify detection:

```bash
bash velox-verify/unity-build.sh detect
# Expected: Unity: /path/to/Unity/Unity   (exit 0)
# If not found: FAIL: no Unity Editor found. Set UNITY_EXE or UNITY_ROOT.  (exit 1)
```

---

## 3. Run the full verification

```bash
bash velox-verify/unity-build.sh all
```

This runs, in order, each step writing its own log under
`velox-verify/logs/`:

| Step | Log file | What it does |
|---|---|---|
| Compile | `unity-compile.log` | Opens the project in batch mode (compiles all C#). |
| Scene | `unity-scene.log` | Calls `VeloxSceneBuilder.GenerateSceneForBatch` via `-executeMethod` (generates `Assets/Scenes/VELOX.unity` + registers it in build settings). |
| Validate | `unity-validate.log` | Checks the scene file exists and is listed in `EditorBuildSettings.asset`. |
| Build | `unity-build.log` | Builds a standalone player to `velox-verify/builds/standalone/`. |
| Test (C#) | `tests-csharp.log` | Runs the offline C# logic harness. |
| Test (Editor) | `tests-editor.log` | Runs the Editor type-check. |
| Test (Node) | `tests-node.log` | Runs the Firebase functions tests. |

**Exit code is non-zero on the first genuine failure.**

### Run individual steps

```bash
bash velox-verify/unity-build.sh compile     # compile only
bash velox-verify/unity-build.sh scene       # generate + validate scene
bash velox-verify/unity-build.sh validate    # check scene + build settings
bash velox-verify/unity-build.sh build       # build standalone player
bash velox-verify/unity-build.sh test        # run all test suites
```

### Build a different target

```bash
export VELOX_BUILD_TARGET=StandaloneOSX    # or StandaloneLinux64, Android, iOS
bash velox-verify/unity-build.sh build
```

Android/iOS builds require the corresponding Unity modules/SDKs installed.

---

## 4. Expected outputs

After a successful `all` run:

- `Assets/Scenes/VELOX.unity` — the generated scene.
- `ProjectSettings/EditorBuildSettings.asset` — contains `Assets/Scenes/VELOX.unity` in the `scenes` list.
- `velox-verify/logs/*.log` — per-step logs.
- `velox-verify/builds/standalone/VeloxStandalone.exe` (or `.app` / `.x86_64`) — the built player.

---

## 5. Mocked tests (no Unity required)

The orchestration script can be tested without Unity using a fake executable:

```bash
bash velox-verify/test/test-unity-build.sh
# Expected: RESULT: 13 passed, 0 failed   (exit 0)
```

This verifies Unity detection, argument parsing, exit-code propagation, log
creation, scene validation, and error handling. **This is NOT a Unity
build** — the mock creates placeholder files only.

---

## 6. First open — what Unity generates

The repo tracks `ProjectSettings/ProjectVersion.txt` and
`Packages/manifest.json` but **does not** commit the rest of Unity's
generated settings (`ProjectSettings.asset`, `InputManager.txt`,
`TagManager.txt`, `EditorBuildSettings.asset`, `Packages/packages-lock.json`).

When Unity 2022.3.21f1 first opens the project it will:

- Import all packages listed in `Packages/manifest.json`
  (InputSystem 1.8.2, TextMeshPro 3.0.6, etc.).
- Generate default `ProjectSettings.asset` (input handling = Both, which
  supports the legacy `Input.GetAxisRaw` / `Input.GetKeyDown` used by
  `RunnerMotor`).
- Generate default `InputManager.txt` (Horizontal/Vertical/Jump axes).
- Generate `EditorBuildSettings.asset` (empty initially — the scene builder
  populates it).

**No manual input or build configuration is needed** — the code uses
Unity's default input axes. If you rename axes, update `RunnerMotor.cs`.

---

## 7. Common failures

| Symptom | Cause / Fix |
|---|---|
| `FAIL: no Unity Editor found` | Set `UNITY_EXE` or `UNITY_ROOT`. |
| Compile log shows `error CS...` | Real C# compilation errors. Fix in `Assets/_Game/Scripts`. |
| `FAIL: scene file not found` | Scene generation didn't run or failed. Check `unity-scene.log`. |
| `FAIL: scene not registered in EditorBuildSettings` | `Build()` didn't set build settings. Check `unity-scene.log` for exceptions. |
| Build fails (`unity-build.log`) | Module/SDK missing for the target, or scenes not in build settings (run `scene` first). |
| `Detection` finds Unity but batch mode fails | Some Unity versions need `-nographics` (already passed) or a display. Try running from a terminal. |

---

## 8. Project completeness checklist

| Item | Status |
|---|---|
| `ProjectSettings/ProjectVersion.txt` (2022.3.21f1) | ✓ tracked |
| `Packages/manifest.json` (InputSystem, TMP, uGUI, etc.) | ✓ tracked |
| Runtime scripts (`Assets/_Game/Scripts/`) | ✓ complete |
| Editor scene builder (`Assets/_Game/Editor/VeloxSceneBuilder.cs`) | ✓ with batch entry point |
| Scene generation entry point | ✓ `GenerateSceneForBatch` via `-executeMethod` |
| Build validation entry point | ✓ `BuildStandaloneBatch` via `-executeMethod` |
| Input configuration | Default Unity axes (auto-generated on first open) |
| Build configuration | Scene registered in build settings by the builder |

---

## 9. Known limitations (unchanged)

- **Unity-native compilation and Play Mode** have not yet been verified
  (Unity was not available in the dev sandbox).
- **Firebase Emulator integration** and **live authentication** remain
  unverified.
- **Native Android/iOS secure storage** still needs on-device verification.
- **Production-grade anti-cheat** beyond UID ownership is not built.
- The `build-editor.sh` type-check compiles against custom Unity stubs
  (where `AddComponent<T>()` returns null) — it verifies compilation and
  reference correctness, **not** runtime behavior or visual layout.
