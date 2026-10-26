#!/usr/bin/env bash
# ============================================================================
# VELOX — Unity build automation (owner-side, requires Unity Editor).
#
# Detects the configured Unity Editor, runs batch-mode compilation + scene
# generation + optional player build + the existing test suites, validates
# outputs, and returns a non-zero exit code on any genuine failure.
#
# Each step writes its own log under velox-verify/logs/ so compilation,
# scene generation, and tests can be reported separately.
#
# This script does NOT install Unity and does NOT download packages. It
# drives whatever Unity is already installed on the host.
#
# Subcommands:
#   detect      — locate the Unity executable and print its path.
#   compile     — batch-mode project compilation (no scene generation).
#   scene       — batch-mode scene generation + validate the output.
#   validate    — check the scene file exists and is in build settings.
#   build       — batch-mode standalone player build (optional target).
#   test        — run the existing C# + Node test suites.
#   all         — compile, scene, validate, build, test (default).
#
# Environment:
#   UNITY_EXE            — explicit Unity executable path.
#   UNITY_ROOT           — Unity install root (looks for Unity/Unity.exe).
#   UNITY_PROJECT_ROOT   — project root (default: repo root).
#   VELX_LOG_DIR         — log directory (default: velox-verify/logs).
#   VELOX_BUILD_TARGET   — build target for `build` (default StandaloneWindows64).
# ============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${VELX_LOG_DIR:-$ROOT/velox-verify/logs}"
PROJECT_ROOT="${UNITY_PROJECT_ROOT:-$ROOT}"
SCENE_REL="Assets/Scenes/VELOX.unity"
BS_REL="ProjectSettings/EditorBuildSettings.asset"
UNITY=""

# --- Unity executable detection --------------------------------------------
detect_unity() {
    if [[ -n "${UNITY_EXE:-}" && -x "${UNITY_EXE}" ]]; then
        UNITY="$UNITY_EXE"; return 0
    fi
    if [[ -n "${UNITY_ROOT:-}" ]]; then
        for c in "$UNITY_ROOT/Unity" "$UNITY_ROOT/Unity.exe" \
                 "$UNITY_ROOT/Editor/Unity" "$UNITY_ROOT/Editor/Unity.exe"; do
            if [[ -x "$c" ]]; then UNITY="$c"; return 0; fi
        done
    fi
    for c in \
        "/Applications/Unity/Hub.app/Contents/MacOS/Unity" \
        "/Applications/Unity/Unity.app/Contents/MacOS/Unity" \
        "/opt/Unity/Editor/Unity" \
        "/usr/local/Unity/Unity" \
        "/snap/unity-editor/current/usr/bin/unity"; do
        if [[ -x "$c" ]]; then UNITY="$c"; return 0; fi
    done
    return 1
}

# --- Unity version check (uses -version, no project open required) ----------
EXPECTED_VERSION="${VELOX_EXPECTED_VERSION:-2022.3.21f1}"

check_unity_version() {
    local actual
    actual=$("$UNITY" -version 2>/dev/null | head -1)
    if [[ -z "$actual" ]]; then
        echo "WARN: could not determine Unity version (Unity may need activation)."
        return 1
    fi
    if [[ "$actual" == *"$EXPECTED_VERSION"* ]]; then
        echo "OK: Unity version $actual (matches expected $EXPECTED_VERSION)"
        return 0
    fi
    echo "WARN: Unity version mismatch. Expected $EXPECTED_VERSION, got '$actual'."
    echo "      Set VELOX_EXPECTED_VERSION to override, or install the expected version."
    return 1
}

# --- Compile (batch mode; opening the project compiles it) -----------------
do_compile() {
    local log="$LOG_DIR/unity-compile.log"
    local unity_log="$log.unity"
    echo "== Unity compile (batch) ==" | tee "$log"
    local rc=0
    "$UNITY" -batchmode -quit -accept-apiupdate \
        -projectPath "$PROJECT_ROOT" \
        -logFile "$unity_log" -nographics || rc=$?
    if [[ -f "$unity_log" ]]; then cat "$unity_log" >> "$log"; fi
    if [[ $rc -ne 0 ]]; then
        echo "FAIL: Unity compile exited $rc" | tee -a "$log"
        return 1
    fi
    echo "OK: Unity compile" | tee -a "$log"
}

# --- Scene generation (batch mode; calls the builder via -executeMethod) ---
do_scene() {
    local log="$LOG_DIR/unity-scene.log"
    local unity_log="$log.unity"
    echo "== Unity scene generation (batch) ==" | tee "$log"
    local rc=0
    "$UNITY" -batchmode -quit -accept-apiupdate \
        -projectPath "$PROJECT_ROOT" \
        -executeMethod VELOX.Editor.VeloxSceneBuilder.GenerateSceneForBatch \
        -logFile "$unity_log" -nographics || rc=$?
    if [[ -f "$unity_log" ]]; then cat "$unity_log" >> "$log"; fi
    if [[ $rc -ne 0 ]]; then
        echo "FAIL: Unity scene generation exited $rc" | tee -a "$log"
        return 1
    fi
    echo "OK: Unity scene generation" | tee -a "$log"
}

# --- Validate scene file + build settings (no Unity required) --------------
do_validate() {
    local log="$LOG_DIR/unity-validate.log"
    echo "== Validate scene + build settings ==" | tee "$log"
    local scene_abs="$PROJECT_ROOT/$SCENE_REL"
    local bs_abs="$PROJECT_ROOT/$BS_REL"
    if [[ ! -f "$scene_abs" ]]; then
        echo "FAIL: scene file not found: $scene_abs" | tee -a "$log"
        return 1
    fi
    if [[ ! -f "$bs_abs" ]]; then
        echo "FAIL: build settings not found: $bs_abs" | tee -a "$log"
        return 1
    fi
    if ! grep -q "$SCENE_REL" "$bs_abs"; then
        echo "FAIL: scene not registered in EditorBuildSettings.asset" | tee -a "$log"
        return 1
    fi
    echo "OK: scene exists and is registered in build settings" | tee -a "$log"
}

# --- Build standalone player (optional; needs the scene in build settings) --
do_build() {
    local log="$LOG_DIR/unity-build.log"
    local unity_log="$log.unity"
    local target="${VELOX_BUILD_TARGET:-StandaloneWindows64}"
    echo "== Unity build ($target) ==" | tee "$log"
    local rc=0
    "$UNITY" -batchmode -quit -accept-apiupdate \
        -projectPath "$PROJECT_ROOT" \
        -executeMethod VELOX.Editor.VeloxSceneBuilder.BuildStandaloneBatch \
        -logFile "$unity_log" -nographics || rc=$?
    if [[ -f "$unity_log" ]]; then cat "$unity_log" >> "$log"; fi
    if [[ $rc -ne 0 ]]; then
        echo "FAIL: Unity build exited $rc" | tee -a "$log"
        return 1
    fi
    # Validate build artifact exists (do not report success if output missing).
    local build_dir="$PROJECT_ROOT/velox-verify/builds/standalone"
    if [[ ! -d "$build_dir" ]]; then
        echo "FAIL: build directory not found: $build_dir" | tee -a "$log"
        return 1
    fi
    if [[ -z "$(find "$build_dir" -maxdepth 1 -name 'VeloxStandalone*' 2>/dev/null)" ]]; then
        echo "FAIL: build artifact not found in $build_dir" | tee -a "$log"
        return 1
    fi
    echo "OK: Unity build ($target) — artifact found" | tee -a "$log"
}

# --- Existing test suites --------------------------------------------------
do_test_csharp() {
    local log="$LOG_DIR/tests-csharp.log"
    echo "== C# harness ==" | tee "$log"
    ( cd "$ROOT" && bash velox-verify/build.sh ) >> "$log" 2>&1 || {
        echo "FAIL: C# harness exited $?" | tee -a "$log"; return 1
    }
    tail -1 "$log"
}

do_test_editor() {
    local log="$LOG_DIR/tests-editor.log"
    echo "== Editor type-check ==" | tee "$log"
    ( cd "$ROOT" && bash velox-verify/build-editor.sh ) >> "$log" 2>&1 || {
        echo "FAIL: editor type-check exited $?" | tee -a "$log"; return 1
    }
    tail -1 "$log"
}

do_test_node() {
    local log="$LOG_DIR/tests-node.log"
    echo "== Node tests ==" | tee "$log"
    ( cd "$ROOT/firebase/functions" && node test/functions.test.js ) >> "$log" 2>&1 || {
        echo "FAIL: Node tests exited $?" | tee -a "$log"; return 1
    }
    tail -1 "$log"
}

usage() {
    cat <<EOF
VELOX Unity build automation.

Usage: bash velox-verify/unity-build.sh <command>

Commands:
  detect      Locate the Unity executable and print its path.
  compile     Batch-mode project compilation (logs/unity-compile.log).
  scene       Batch-mode scene generation + validate (logs/unity-scene.log).
  validate    Check scene file + build settings (logs/unity-validate.log).
  build       Batch-mode standalone player build (logs/unity-build.log).
  test        Run C# + editor type-check + Node suites.
  all         Compile, scene, validate, build, test (default).

Environment:
  UNITY_EXE             Explicit Unity executable path.
  UNITY_ROOT            Unity install root (looks for Unity/Unity.exe).
  UNITY_PROJECT_ROOT    Project root (default: repo root).
  VELX_LOG_DIR          Log directory (default: velox-verify/logs).
  VELOX_BUILD_TARGET    Build target for 'build' (default StandaloneWindows64).
EOF
}

main() {
    local cmd="${1:-all}"
    mkdir -p "$LOG_DIR"

    case "$cmd" in
        detect)
            if detect_unity; then
                echo "Unity: $UNITY"
                check_unity_version || echo "WARN: version check failed — proceed with caution."
                exit 0
            fi
            echo "FAIL: no Unity Editor found. Set UNITY_EXE or UNITY_ROOT."
            exit 1
            ;;
        compile)
            detect_unity || { echo "FAIL: no Unity found"; exit 1; }
            do_compile
            ;;
        scene)
            detect_unity || { echo "FAIL: no Unity found"; exit 1; }
            do_scene && do_validate
            ;;
        validate)
            do_validate
            ;;
        build)
            detect_unity || { echo "FAIL: no Unity found"; exit 1; }
            do_build
            ;;
        test)
            do_test_csharp && do_test_editor && do_test_node
            ;;
        all)
            detect_unity || { echo "FAIL: no Unity found. Set UNITY_EXE or UNITY_ROOT."; exit 1; }
            check_unity_version || echo "WARN: version mismatch — proceeding anyway."
            do_compile && \
            do_scene && do_validate && \
            do_build && \
            do_test_csharp && \
            do_test_editor && \
            do_test_node
            echo ""
            echo "== VELOX verification complete =="
            echo "Logs: $LOG_DIR"
            ;;
        -h|--help|help)
            usage
            ;;
        *)
            echo "Unknown command: $cmd"
            usage
            exit 2
            ;;
    esac
}

main "$@"
