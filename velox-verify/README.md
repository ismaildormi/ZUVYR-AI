# VELOX — offline verification harness

This folder lets you type-check and unit-test VELOX's pure C# logic **without
the Unity Editor**. It compiles every `Assets/_Game/Scripts/**/*.cs` together
with minimal Unity API stubs and a hand-written test program, then runs the
tests as a plain console app.

> It verifies **logic** (leaderboard ordering, tie-breaking, month isolation,
> reset, name sanitisation, JSON parsing, identity constants). It does **not**
> verify Unity runtime behaviour: physics, rendering, animation, input, audio,
> and network calls remain for the Unity Editor / device.

## Requirements

- A .NET SDK. Any `net10.0`-capable SDK works; the sandbox used .NET SDK 10.

## Run (csc, the sandbox path)

```
bash velox-verify/build.sh            # game sources + stubs + logic tests
bash velox-verify/build-editor.sh     # type-checks Assets/_Game/Editor/*.cs
```

`build.sh` locates `csc.dll` + reference assemblies, compiles all sources with
`-nologo -nostdlib -nowarn:CS0649`, writes a `runtimeconfig.json`, runs the
tests, and exits non-zero on any failure.

`build-editor.sh` compiles the game sources + stubs + the Editor scene builder
as a library (no `Main`) to catch syntax/type errors in `VeloxSceneBuilder`
without the Unity Editor.

## Run (portable dotnet project)

```
dotnet build velox-verify/VeloxVerify.csproj -c Release
dotnet velox-verify/bin/Release/net10.0/VeloxVerify.dll
```

(The sandbox's `/tmp` is not user-writable, so the `dotnet build` path was run
with a writable `TMPDIR`/`HOME`; on a normal machine this needs no special
environment.)

## What is covered

- Identity constants: `GameIdentity` (VELOX / NEO, Top-10, Top-3).
- `LeaderboardEntry.SanitiseName` (null/empty/whitespace/collapse/limit).
- Month key format and stability.
- Leaderboard ordering (score desc), Top-10 truncation, duplicate-name max,
  deterministic tie-break (score → earlier timestamp → name ordinal).
- Month isolation (a prior month never leaks into the current Top-10).
- `PlayerProfile` fallback (display name ≠ identity).
- `MiniJson` parsing of the RTDB `{uid:{...}}` month map (secure read path).

## In-Unity tests

`Assets/Tests/VeloxLogicTests.cs` mirrors the above as NUnit EditMode tests,
runnable from **Window → General → Test Runner** once the Unity Editor is
available.

## Result

```
RESULT: 37 passed, 0 failed   (0 warnings, 0 errors)
Editor scene builder type-check: 0 errors
```

## What the Editor type-check covers

`build-editor.sh` validates that `VeloxSceneBuilder` (camera, lights, runner,
track, UI panels/buttons/TextMeshPro, leaderboard rows, build-settings
registration) is syntactically and type-correct against the Unity API stubs —
without the Unity Editor. It does **not** run the builder or create a real
`.unity` file; that requires the Editor.
