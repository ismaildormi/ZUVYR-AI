#!/usr/bin/env bash
# ============================================================================
# Mocked tests for velox-verify/unity-build.sh.
#
# These tests use a FAKE Unity executable (velox-verify/test/mock-unity.sh)
# to verify the orchestration script's behaviour: Unity detection, argument
# parsing, exit-code propagation, log creation, and scene validation.
#
# THIS IS NOT A UNITY BUILD. The mock creates placeholder files so the
# shell logic can be tested without a real Unity installation. Genuine
# Unity compilation, scene generation, and player builds are NOT exercised
# here — they remain BLOCKED until Unity is installed.
# ============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/velox-verify/unity-build.sh"
MOCK="$ROOT/velox-verify/test/mock-unity.sh"
# Use a repo-local temp dir (the sandbox /tmp may be read-only).
WORK="$ROOT/velox-verify/.test-tmp"
rm -rf "$WORK"
mkdir -p "$WORK"
trap 'rm -rf "$WORK"' EXIT

PASS=0; FAIL=0
ok()  { echo "  PASS: $1"; PASS=$((PASS+1)); }
bad() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

echo "== Mocked: detect (fake UNITY_EXE) =="
if UNITY_EXE="$MOCK" bash "$SCRIPT" detect >/dev/null 2>&1; then
    ok "detect finds fake unity"
else
    bad "detect finds fake unity"
fi

echo "== Mocked: compile (fake unity, no executeMethod) =="
if UNITY_EXE="$MOCK" UNITY_PROJECT_ROOT="$WORK" VELX_LOG_DIR="$WORK/logs" \
   bash "$SCRIPT" compile >/dev/null 2>&1; then
    ok "compile exits 0 with fake unity"
else
    bad "compile exits 0 with fake unity"
fi
if test -f "$WORK/logs/unity-compile.log"; then
    ok "compile log created"
else
    bad "compile log created"
fi

echo "== Mocked: scene + validate (success) =="
if UNITY_EXE="$MOCK" UNITY_PROJECT_ROOT="$WORK" VELX_LOG_DIR="$WORK/logs" \
   bash "$SCRIPT" scene >/dev/null 2>&1; then
    ok "scene+validate exits 0"
else
    bad "scene+validate exits 0"
fi
if test -f "$WORK/Assets/Scenes/VELOX.unity"; then
    ok "scene file created by mock"
else
    bad "scene file created by mock"
fi
if test -f "$WORK/logs/unity-scene.log"; then
    ok "scene log created"
else
    bad "scene log created"
fi
if test -f "$WORK/logs/unity-validate.log"; then
    ok "validate log created"
else
    bad "validate log created"
fi

echo "== Mocked: validate (scene missing -> failure) =="
if UNITY_PROJECT_ROOT="$WORK/empty" VELX_LOG_DIR="$WORK/logs" \
   bash "$SCRIPT" validate >/dev/null 2>&1; then
    bad "validate fails when scene missing (should exit non-zero)"
else
    ok "validate fails when scene missing (exit non-zero)"
fi

echo "== Mocked: scene with scene-not-in-build-settings -> failure =="
# Mock unity creates the scene file but NOT build settings when method is wrong.
# Simulate by removing build settings after scene creation.
if UNITY_EXE="$MOCK" UNITY_PROJECT_ROOT="$WORK" VELX_LOG_DIR="$WORK/logs" \
   bash "$SCRIPT" scene >/dev/null 2>&1; then
    rm -f "$WORK/ProjectSettings/EditorBuildSettings.asset"
    if UNITY_PROJECT_ROOT="$WORK" VELX_LOG_DIR="$WORK/logs" \
       bash "$SCRIPT" validate >/dev/null 2>&1; then
        bad "validate fails when build settings missing (should exit non-zero)"
    else
        ok "validate fails when build settings missing (exit non-zero)"
    fi
else
    bad "scene creation (precondition)"
fi

echo "== Mocked: mock unity failure propagates =="
if MOCK_UNITY_FAIL=1 UNITY_EXE="$MOCK" UNITY_PROJECT_ROOT="$WORK" \
   VELX_LOG_DIR="$WORK/logs" bash "$SCRIPT" scene >/dev/null 2>&1; then
    bad "scene fails when mock exits non-zero (should exit non-zero)"
else
    ok "scene fails when mock exits non-zero (exit non-zero)"
fi

echo "== Mocked: build (fake unity) =="
if UNITY_EXE="$MOCK" UNITY_PROJECT_ROOT="$WORK" VELX_LOG_DIR="$WORK/logs" \
   bash "$SCRIPT" build >/dev/null 2>&1; then
    ok "build exits 0 with fake unity"
else
    bad "build exits 0 with fake unity"
fi
if test -f "$WORK/velox-verify/builds/standalone/VeloxStandalone.exe"; then
    ok "mock build artifact created"
else
    bad "mock build artifact created"
fi

echo "== Mocked: unknown command =="
if bash "$SCRIPT" bogus-command >/dev/null 2>&1; then
    bad "unknown command exits non-zero"
else
    ok "unknown command exits non-zero"
fi

echo "== Mocked: all (full orchestration with mock unity) =="
if UNITY_EXE="$MOCK" UNITY_PROJECT_ROOT="$WORK" VELX_LOG_DIR="$WORK/logs" \
   bash "$SCRIPT" all >/dev/null 2>&1; then
    rc=0
else
    rc=$?
fi
# The 'all' command must exit non-zero when any test suite fails.
# With no .NET SDK, do_test_csharp fails, so 'all' must exit non-zero.
if [ "$rc" -ne 0 ]; then
    ok "all exits non-zero when test suites fail (fake unity, no .NET SDK)"
else
    bad "all exits non-zero when test suites fail (fake unity, no .NET SDK)"
fi
if test -f "$WORK/logs/unity-compile.log" && test -f "$WORK/logs/unity-scene.log" \
   && test -f "$WORK/logs/unity-validate.log" && test -f "$WORK/logs/unity-build.log" \
   && test -f "$WORK/logs/tests-csharp.log" && test -f "$WORK/logs/tests-editor.log" \
   && test -f "$WORK/logs/tests-node.log"; then
    ok "all logs created (compile+scene+validate+build+tests)"
else
    bad "all logs created (compile+scene+validate+build+tests)"
fi

echo "== Mocked: detect with version check (default mock version matches) =="
if UNITY_EXE="$MOCK" bash "$SCRIPT" detect 2>&1 | grep -q "OK: Unity version"; then
    ok "detect reports version match"
else
    bad "detect reports version match"
fi

echo "== Mocked: detect with wrong version (warns but still exits 0) =="
if MOCK_UNITY_VERSION="9999.0.0f1" UNITY_EXE="$MOCK" bash "$SCRIPT" detect 2>&1 | grep -q "WARN: Unity version mismatch"; then
    ok "detect warns on version mismatch"
else
    bad "detect warns on version mismatch"
fi

echo "== Mocked: build with missing artifact (Unity exits 0 but no file) =="
# The mock is told to NOT create the build artifact. Unity exits 0,
# but do_build must detect the missing artifact and fail.
rm -rf "$WORK/velox-verify/builds"
if MOCK_UNITY_NO_BUILD=1 UNITY_EXE="$MOCK" UNITY_PROJECT_ROOT="$WORK" VELX_LOG_DIR="$WORK/logs" \
   bash "$SCRIPT" build >/dev/null 2>&1; then
    bad "build fails when artifact missing (should exit non-zero)"
else
    ok "build fails when artifact missing (exit non-zero)"
fi

echo "== Mocked: build artifact validation catches stale/empty dir =="
# Create an empty build dir (no artifact) and confirm build fails.
rm -rf "$WORK/velox-verify/builds"
mkdir -p "$WORK/velox-verify/builds/standalone"
if MOCK_UNITY_NO_BUILD=1 UNITY_EXE="$MOCK" UNITY_PROJECT_ROOT="$WORK" VELX_LOG_DIR="$WORK/logs" \
   bash "$SCRIPT" build >/dev/null 2>&1; then
    bad "build fails with empty build dir (should exit non-zero)"
else
    ok "build fails with empty build dir (exit non-zero)"
fi

echo ""
echo "RESULT: $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]]
