#!/usr/bin/env bash
# ============================================================================
# VELOX offline type-check for the Editor scene builder.
# Compiles the game sources + Unity stubs + Assets/_Game/Editor/*.cs as a
# library (no Main needed) to catch syntax/type errors in the scene builder
# without the Unity Editor. Exit code = compile success.
# ============================================================================
set -uo pipefail

export DOTNET_ROOT=/tmp
export DOTNET_CLI_HOME=/home/user/.dotnethome
export HOME=/home/user/.dotnethome
export TMPDIR=/home/user/.dotnethome/tmp
export DOTNET_NOLOGO=1
export DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1
export DOTNET_CLI_TELEMETRY_OPTOUT=1

DOTNET=/tmp/dotnet
CSC=/tmp/sdk/10.0.400/Roslyn/bincore/csc.dll
REFDIR=$(ls -d /tmp/packs/Microsoft.NETCore.App.Ref/*/ref/net10.0)
ROOT=/home/user/ZUVYR-AI
OUT=/home/user/.dotnethome/velox-editor

if [ ! -x "$DOTNET" ]; then
  echo "ERROR: .NET SDK not found at $DOTNET"; exit 2
fi

rm -rf "$OUT"; mkdir -p "$OUT"

GAME_FILES=$(find "$ROOT/Assets/_Game/Scripts" -name '*.cs' | sort)
EDITOR_FILES=$(find "$ROOT/Assets/_Game/Editor" -name '*.cs' | sort)
SRCS="$ROOT/velox-verify/UnityEngineStubs.cs $GAME_FILES $EDITOR_FILES"

REFS=""
for f in "$REFDIR"/*.dll; do REFS="$REFS -r:$f"; done

echo "== Compiling VELOX game + Editor builder sources + stubs =="
cd "$OUT"
# shellcheck disable=SC2086
$DOTNET "$CSC" -nologo -nostdlib -target:library -out:velox-editor.dll $REFS $SRCS > compile.log 2>&1
RC=$?
cat compile.log
if [ $RC -ne 0 ]; then
  echo "== EDITOR BUILD FAILED (exit $RC) =="
  exit $RC
fi

echo "== Editor builder type-check OK (0 errors) =="
