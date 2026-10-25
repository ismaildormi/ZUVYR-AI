#!/usr/bin/env bash
# ============================================================================
# VELOX offline verification build.
# Compiles every VELOX game C# source + Unity stubs + the logic test runner
# with the bundled .NET Roslyn compiler (no Unity Editor, no network), then
# runs the tests. Exit code reflects pass/fail.
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
OUT=/home/user/.dotnethome/velox-verify

if [ ! -x "$DOTNET" ]; then
  echo "ERROR: .NET SDK not found at $DOTNET"; exit 2
fi

rm -rf "$OUT"; mkdir -p "$OUT"

GAME_FILES=$(find "$ROOT/Assets/_Game/Scripts" -name '*.cs' | sort)
SRCS="$ROOT/velox-verify/UnityEngineStubs.cs $ROOT/velox-verify/Program.cs $GAME_FILES"

REFS=""
for f in "$REFDIR"/*.dll; do REFS="$REFS -r:$f"; done

echo "== Compiling VELOX sources + stubs + tests =="
cd "$OUT"
# shellcheck disable=SC2086
$DOTNET "$CSC" -nologo -nostdlib -target:exe -out:velox-verify.dll $REFS $SRCS > compile.log 2>&1
RC=$?
cat compile.log
if [ $RC -ne 0 ]; then
  echo "== COMPILE FAILED (exit $RC) =="
  exit $RC
fi

printf '{"runtimeOptions":{"tfm":"net10.0","framework":{"name":"Microsoft.NETCore.App","version":"10.0.0"}}}\n' > velox-verify.runtimeconfig.json

echo "== Running VELOX logic tests =="
$DOTNET velox-verify.dll
