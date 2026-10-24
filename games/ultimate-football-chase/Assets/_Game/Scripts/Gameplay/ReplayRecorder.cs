using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UltimateFootballChase.Core;
using UltimateFootballChase.CameraSystem;

namespace UltimateFootballChase.Gameplay
{
    /// <summary>Fixed-memory pose recorder: the VAR is a visual replay, not a second simulation.</summary>
    public sealed class ReplayRecorder
    {
        private const int MaxFrames = 128;
        private const int MaxActors = 96;
        private const float CaptureInterval = .05f; // provisional 20fps capture; interpolated playback
        private readonly Frame[] frames = new Frame[MaxFrames];
        private readonly List<Transform> actors = new List<Transform>(MaxActors);
        private readonly List<Transform> originals = new List<Transform>(MaxActors);
        private readonly Pose[] originalPoses = new Pose[MaxActors];
        private int writeIndex;
        private int count;
        private float accumulator;
        private readonly RunConfig config;
        private readonly RunnerMotor runner;
        private readonly TrackWorld world;
        private readonly Transform chaser;
        public bool SkipRequested { get; set; }

        private struct Pose
        {
            public Vector3 Position;
            public Quaternion Rotation;
            public Vector3 LocalScale;
            public bool ActiveSelf;
            public Pose(Transform t)
            {
                Position = t.position; Rotation = t.rotation; LocalScale = t.localScale;
                ActiveSelf = t.gameObject.activeSelf;
            }
            public void Apply(Transform t)
            {
                if (t == null) return;
                t.position = Position; t.rotation = Rotation; t.localScale = LocalScale;
                t.gameObject.SetActive(ActiveSelf); // restore picked coins/powers during earlier VAR frames
            }
        }
        private sealed class Frame
        {
            public readonly Transform[] Actors = new Transform[MaxActors];
            public readonly Pose[] Poses = new Pose[MaxActors];
            public int Count;
        }
        public ReplayRecorder(RunConfig settings, RunnerMotor player, TrackWorld track, Transform pursuer)
        {
            config = settings; runner = player; world = track; chaser = pursuer;
            for (int i = 0; i < frames.Length; i++) frames[i] = new Frame();
        }
        public void Reset() { writeIndex = count = 0; accumulator = 0; SkipRequested = false; }
        public void Capture(float dt)
        {
            accumulator += dt;
            if (accumulator < CaptureInterval) return;
            accumulator -= CaptureInterval;
            actors.Clear();
            AddRunnerActors(actors);
            actors.Add(chaser);
            world.GetReplayActors(actors);
            Frame f = frames[writeIndex];
            f.Count = Mathf.Min(actors.Count, MaxActors);
            for (int i = 0; i < f.Count; i++)
            {
                f.Actors[i] = actors[i];
                f.Poses[i] = new Pose(actors[i]);
            }
            writeIndex = (writeIndex + 1) % frames.Length;
            count = Mathf.Min(count + 1, Mathf.Min(MaxFrames, Mathf.CeilToInt(config.ReplayHistorySeconds / CaptureInterval)));
        }
        private void AddRunnerActors(List<Transform> output)
        {
            output.Add(runner.transform);
            // Includes the visual body and individually enabled magnet/shoes/jetpack/board effects.
            for (int i = 0; i < runner.transform.childCount; i++)
                output.Add(runner.transform.GetChild(i));
        }
        public IEnumerator Play(ChaseCamera camera, System.Action<float> onProgress, System.Action onFinished)
        {
            SkipRequested = false;
            originals.Clear();
            AddRunnerActors(originals);
            originals.Add(chaser);
            world.GetReplayActors(originals);
            int originalCount = Mathf.Min(originals.Count, MaxActors);
            for (int i = 0; i < originalCount; i++) originalPoses[i] = new Pose(originals[i]);
            float realElapsed = 0;
            float playback = 0;
            float length = Mathf.Max(CaptureInterval, (count - 1) * CaptureInterval);
            int oldest = (writeIndex - count + MaxFrames) % MaxFrames;
            try
            {
                while (playback < length)
                {
                    realElapsed += Time.unscaledDeltaTime;
                    if (SkipRequested && realElapsed >= config.MinimumReplayBeforeSkipSeconds) break;
                    playback = Mathf.Min(length, playback + Time.unscaledDeltaTime * config.ReplayPlaybackSpeed);
                    int frameIndex = Mathf.Min(count - 1, Mathf.FloorToInt(playback / CaptureInterval));
                    Frame frame = frames[(oldest + frameIndex) % MaxFrames];
                    for (int i = 0; i < frame.Count; i++) frame.Poses[i].Apply(frame.Actors[i]);
                    float progress = playback / length;
                    camera.SetReplayAngle(progress);
                    onProgress?.Invoke(progress);
                    yield return null;
                }
            }
            finally
            {
                for (int i = 0; i < originalCount; i++) originalPoses[i].Apply(originals[i]);
                camera.SnapNormal();
            }
            onFinished?.Invoke();
        }
    }
}
