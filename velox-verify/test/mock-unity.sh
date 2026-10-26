#!/usr/bin/env bash
# ============================================================================
# MOCK Unity Editor — TEST DOUBLE ONLY, NOT UNITY.
#
# This script mimics Unity's -batchmode command-line interface so the
# velox-verify/unity-build.sh orchestration can be tested without a real
# Unity installation. It does NOT compile C#, does NOT generate a real
# Unity scene, and does NOT build a player. It creates placeholder files
# so the shell script's validation logic can be exercised.
#
# Labelled as a mocked test: any .unity or build output produced here is a
# test artifact, NOT a genuine Unity result.
# ============================================================================
set -uo pipefail

PROJECT_ROOT=""
LOG_FILE=""
EXECUTE_METHOD=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        -projectPath)  PROJECT_ROOT="$2"; shift 2 ;;
        -logFile)      LOG_FILE="$2"; shift 2 ;;
        -executeMethod) EXECUTE_METHOD="$2"; shift 2 ;;
        -batchmode|-quit|-nographics) shift ;;
        --*) shift ;;
        *) shift ;;
    esac
done

echo "[mock-unity] project=$PROJECT_ROOT method=$EXECUTE_METHOD" >> "$LOG_FILE"

# Simulate a Unity failure when requested (tests exit-code propagation).
if [[ "${MOCK_UNITY_FAIL:-0}" == "1" ]]; then
    echo "[mock-unity] SIMULATED FAILURE (MOCK_UNITY_FAIL=1)" >> "$LOG_FILE"
    exit 1
fi

# Generate mock scene + build settings when the scene-gen method is called.
if [[ "$EXECUTE_METHOD" == *"GenerateSceneForBatch"* ]]; then
    SCENE_DIR="$PROJECT_ROOT/Assets/Scenes"
    mkdir -p "$SCENE_DIR"
    printf '%s\n' \
        "// MOCK SCENE — test artifact, NOT a real Unity scene." \
        "// Created by velox-verify/test/mock-unity.sh for script testing." \
        "" > "$PROJECT_ROOT/Assets/Scenes/VELOX.unity"

    BS_DIR="$PROJECT_ROOT/ProjectSettings"
    mkdir -p "$BS_DIR"
    printf '%s\n' \
        "scenes:" \
        "  -" \
        "    fileID: 1" \
        "    guid: mock-guid" \
        "    path: Assets/Scenes/VELOX.unity" \
        "" > "$BS_DIR/EditorBuildSettings.asset"
    echo "[mock-unity] created mock scene + build settings" >> "$LOG_FILE"
fi

# Simulate a player build when the build method is called.
if [[ "$EXECUTE_METHOD" == *"BuildStandaloneBatch"* ]]; then
    BUILD_DIR="$PROJECT_ROOT/velox-verify/builds/standalone"
    mkdir -p "$BUILD_DIR"
    printf '%s\n' "MOCK BUILD ARTIFACT — test double, NOT a real build." > "$BUILD_DIR/VeloxStandalone.exe"
    echo "[mock-unity] created mock build artifact" >> "$LOG_FILE"
fi

exit 0
