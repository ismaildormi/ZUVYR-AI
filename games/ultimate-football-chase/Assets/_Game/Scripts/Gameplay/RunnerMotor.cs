using UnityEngine;
using UltimateFootballChase.Core;
using UltimateFootballChase.Input;

namespace UltimateFootballChase.Gameplay
{
    /// <summary>World scrolls; runner stays near z=0. Deterministic arcade movement without a Rigidbody.</summary>
    public sealed class RunnerMotor : MonoBehaviour
    {
        private RunConfig config;
        private Transform visual;
        private Animator artAnimator;
        private bool externalArt;
        private readonly System.Collections.Generic.HashSet<int> artBools = new System.Collections.Generic.HashSet<int>();
        private readonly System.Collections.Generic.HashSet<int> artFloats = new System.Collections.Generic.HashSet<int>();
        private static readonly int JumpId = Animator.StringToHash("Jump");
        private static readonly int SlideId = Animator.StringToHash("Slide");
        private static readonly int StumbleId = Animator.StringToHash("Stumble");
        private static readonly int FallId = Animator.StringToHash("Fall");
        private static readonly int FlyId = Animator.StringToHash("Fly");
        private static readonly int RunSpeedId = Animator.StringToHash("RunSpeed");
        private int lane = 1;
        private float laneStartX, laneElapsed, verticalElapsed, slideLeft, stumbleLeft, invulnerableLeft, runCycle;
        private bool jumping, sliding, falling, flying, superShoes;
        private float flightHeight, shoeMultiplier;
        private bool hasBufferedAction;
        private RunAction bufferedAction;

        public int Lane => lane;
        public Transform Visual => visual;
        public bool UsesExternalArt => externalArt;
        /// <summary>The mesh is visual-only: animation cannot move the arcade hit box or change the lane.</summary>
        public void SetExternalArt(Transform prefabInstance)
        {
            if (prefabInstance == null || prefabInstance.parent != transform) return;
            if (visual != null) visual.gameObject.SetActive(false); // keep greybox as a reversible fallback
            visual = prefabInstance;
            externalArt = true;
            artAnimator = visual.GetComponentInChildren<Animator>();
            artBools.Clear(); artFloats.Clear();
            if (artAnimator != null)
            {
                artAnimator.applyRootMotion = false;
                foreach (AnimatorControllerParameter parameter in artAnimator.parameters)
                {
                    if (parameter.type == AnimatorControllerParameterType.Bool) artBools.Add(parameter.nameHash);
                    if (parameter.type == AnimatorControllerParameterType.Float) artFloats.Add(parameter.nameHash);
                }
            }
            AnimateVisual();
        }
        public bool IsJumping => jumping;
        public int AcceptedJumps { get; private set; }
        public bool IsSliding => sliding;
        public bool IsInvulnerable => invulnerableLeft > 0;
        public float FeetHeight => transform.position.y;
        public float X => transform.position.x;
        public float StumbleLeft => stumbleLeft;

        public void Initialize(RunConfig settings, Transform model)
        {
            config = settings;
            visual = model;
            ResetMotor();
        }
        public void ResetMotor()
        {
            lane = 1;
            AcceptedJumps = 0;
            laneStartX = 0;
            laneElapsed = config.LaneChangeSeconds;
            jumping = sliding = falling = flying = superShoes = hasBufferedAction = false;
            flightHeight = 0f;
            shoeMultiplier = 1f;
            verticalElapsed = slideLeft = stumbleLeft = invulnerableLeft = runCycle = 0;
            transform.position = Vector3.zero;
            AnimateVisual();
        }
        public void Queue(RunAction action)
        {
            if (flying && (action == RunAction.Jump || action == RunAction.Slide)) return;
            if (action == RunAction.Slide && jumping)
                verticalElapsed = Mathf.Max(verticalElapsed, config.JumpSeconds * .72f); // fast fall, slide on landing
            if (IsBusyFor(action)) { bufferedAction = action; hasBufferedAction = true; return; }
            Act(action);
        }
        private bool IsBusyFor(RunAction action)
        {
            if (action == RunAction.Left || action == RunAction.Right) return laneElapsed < config.LaneChangeSeconds;
            return jumping || sliding;
        }
        private void Act(RunAction action)
        {
            switch (action)
            {
                case RunAction.Left: ChangeLane(-1); break;
                case RunAction.Right: ChangeLane(1); break;
                case RunAction.Jump:
                    if (sliding) break;
                    jumping = true;
                    if (AcceptedJumps < 1000000) AcceptedJumps++;
                    verticalElapsed = 0;
                    break;
                case RunAction.Slide:
                    if (jumping) // Fast fall: do not immediately grant slide clearance mid-air.
                    {
                        verticalElapsed = Mathf.Max(verticalElapsed, config.JumpSeconds * .72f);
                    }
                    else { sliding = true; slideLeft = config.SlideSeconds; }
                    break;
            }
        }
        private void ChangeLane(int offset)
        {
            int target = Mathf.Clamp(lane + offset, 0, 2);
            if (target == lane) return;
            laneStartX = transform.position.x;
            lane = target;
            laneElapsed = 0;
        }
        public void Tick(float dt)
        {
            runCycle += dt * 11f; // provisional simple greybox run bob; replace with original animations later
            laneElapsed = Mathf.Min(config.LaneChangeSeconds, laneElapsed + dt);
            float t = Mathf.SmoothStep(0f, 1f, laneElapsed / config.LaneChangeSeconds);
            float x = Mathf.Lerp(laneStartX, (lane - 1) * config.LaneWidth, t);
            float y = transform.position.y;
            if (flying) y = flightHeight;
            else if (jumping)
            {
                verticalElapsed += dt;
                float progress = Mathf.Clamp01(verticalElapsed / config.JumpSeconds);
                y = config.JumpHeight * (superShoes ? shoeMultiplier : 1f) * 4f * progress * (1f - progress);
                if (progress >= 1f) { jumping = false; y = 0; }
            }
            if (sliding) { slideLeft -= dt; if (slideLeft <= 0) sliding = false; }
            stumbleLeft = Mathf.Max(0, stumbleLeft - dt);
            invulnerableLeft = Mathf.Max(0, invulnerableLeft - dt);
            transform.position = new Vector3(x, y, 0);
            AnimateVisual();
            if (hasBufferedAction && !IsBusyFor(bufferedAction))
            {
                RunAction next = bufferedAction;
                hasBufferedAction = false;
                Act(next);
            }
        }
        private void AnimateVisual()
        {
            if (visual == null) return;
            if (externalArt)
            {
                // Humanoid Animator drives its own pose. Never squash a rig for the greybox slide/bob.
                if (artAnimator != null)
                {
                    if (artBools.Contains(JumpId)) artAnimator.SetBool(JumpId, jumping);
                    if (artBools.Contains(SlideId)) artAnimator.SetBool(SlideId, sliding);
                    if (artBools.Contains(StumbleId)) artAnimator.SetBool(StumbleId, stumbleLeft > 0f);
                    if (artBools.Contains(FallId)) artAnimator.SetBool(FallId, falling);
                    if (artBools.Contains(FlyId)) artAnimator.SetBool(FlyId, flying);
                    if (artFloats.Contains(RunSpeedId)) artAnimator.SetFloat(RunSpeedId, falling ? 0f : 1f);
                }
                return;
            }
            visual.localPosition = falling ? new Vector3(0, .45f, 0) : sliding ? new Vector3(0, .52f, 0) :
                new Vector3(0, .95f + (jumping ? 0f : Mathf.Abs(Mathf.Sin(runCycle)) * .06f), 0);
            visual.localScale = sliding ? new Vector3(.85f, .55f, 1.3f) : new Vector3(.85f, 1.6f, .85f);
            visual.localRotation = falling ? Quaternion.Euler(75, 0, 0) : stumbleLeft > 0 ? Quaternion.Euler(0, 0, 18) : Quaternion.identity;
        }
        public void SetPowerEffects(bool shoes, float jumpMultiplier, bool jetpack, float height, float landingGrace)
        {
            superShoes = shoes;
            shoeMultiplier = Mathf.Max(1f, jumpMultiplier);
            if (jetpack && !flying)
            {
                jumping = sliding = hasBufferedAction = false;
                verticalElapsed = slideLeft = 0f;
            }
            if (!jetpack && flying)
                invulnerableLeft = Mathf.Max(invulnerableLeft, landingGrace);
            flying = jetpack;
            flightHeight = height;
        }
        public void Stumble() { stumbleLeft = config.StumbleSeconds; AnimateVisual(); }
        public void Fall() { falling = true; AnimateVisual(); }
        public void Revive()
        {
            jumping = sliding = falling = flying = superShoes = hasBufferedAction = false;
            verticalElapsed = slideLeft = stumbleLeft = 0;
            transform.position = new Vector3((lane - 1) * config.LaneWidth, 0, 0);
            laneStartX = transform.position.x;
            laneElapsed = config.LaneChangeSeconds;
            invulnerableLeft = config.ReviveInvulnerabilitySeconds;
            AnimateVisual();
        }
    }
}
