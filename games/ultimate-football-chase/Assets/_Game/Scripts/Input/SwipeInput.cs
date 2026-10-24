using System;
using UnityEngine;
using UltimateFootballChase.Core;

namespace UltimateFootballChase.Input
{
    public enum RunAction { Left, Right, Jump, Slide }

    /// <summary>Legacy touch and keyboard are polled only while running. UI taps never become swipes.</summary>
    public sealed class SwipeInput : MonoBehaviour
    {
        public event Action<RunAction> OnAction;
        public event Action OnDoubleTap;
        private Vector2 start;
        private bool tracking;
        private GameDirector director;
        private float lastTapTime = -100f;
        private Vector2 lastTapPosition;
        private float doubleTapWindow = .35f;
        public void Initialize(GameDirector owner, float doubleTapSeconds)
        {
            director = owner;
            doubleTapWindow = doubleTapSeconds;
        }
        private void Update()
        {
            if (director == null || !director.IsRunning) { tracking = false; lastTapTime = -100f; return; }
            if (UnityEngine.Input.GetKeyDown(KeyCode.LeftArrow) || UnityEngine.Input.GetKeyDown(KeyCode.A)) OnAction?.Invoke(RunAction.Left);
            if (UnityEngine.Input.GetKeyDown(KeyCode.RightArrow) || UnityEngine.Input.GetKeyDown(KeyCode.D)) OnAction?.Invoke(RunAction.Right);
            if (UnityEngine.Input.GetKeyDown(KeyCode.UpArrow) || UnityEngine.Input.GetKeyDown(KeyCode.W) || UnityEngine.Input.GetKeyDown(KeyCode.Space)) OnAction?.Invoke(RunAction.Jump);
            if (UnityEngine.Input.GetKeyDown(KeyCode.DownArrow) || UnityEngine.Input.GetKeyDown(KeyCode.S)) OnAction?.Invoke(RunAction.Slide);
            if (UnityEngine.Input.GetKeyDown(KeyCode.H)) OnDoubleTap?.Invoke(); // editor-only keyboard fallback

            if (UnityEngine.Input.touchCount == 0)
            {
                // Mouse supports editor playtests without fake touch events on a phone.
                if (UnityEngine.Input.GetMouseButtonDown(0)) { start = UnityEngine.Input.mousePosition; tracking = start.y < Screen.height * .86f; }
                if (UnityEngine.Input.GetMouseButtonUp(0) && tracking)
                {
                    HandleGesture((Vector2)UnityEngine.Input.mousePosition);
                    tracking = false;
                }
                return;
            }
            Touch touch = UnityEngine.Input.GetTouch(0);
            switch (touch.phase)
            {
                case TouchPhase.Began:
                    start = touch.position;
                    tracking = start.y < Screen.height * .86f; // provisional HUD exclusion
                    break;
                case TouchPhase.Ended:
                    if (tracking) HandleGesture(touch.position);
                    tracking = false;
                    break;
                case TouchPhase.Canceled: tracking = false; break;
            }
        }
        private void HandleGesture(Vector2 end)
        {
            Vector2 delta = end - start;
            // Provisional threshold: 8% of the smaller screen dimension, resolution independent.
            float threshold = Mathf.Min(Screen.width, Screen.height) * .08f;
            if (delta.magnitude < threshold)
            {
                if (Time.unscaledTime - lastTapTime <= doubleTapWindow &&
                    Vector2.Distance(end, lastTapPosition) < threshold * 1.5f)
                {
                    lastTapTime = -100f; // require another pair for the next board
                    OnDoubleTap?.Invoke();
                }
                else { lastTapTime = Time.unscaledTime; lastTapPosition = end; }
                return;
            }
            lastTapTime = -100f; // swipes cannot accidentally complete a double tap
            RunAction action = Mathf.Abs(delta.x) > Mathf.Abs(delta.y)
                ? (delta.x > 0 ? RunAction.Right : RunAction.Left)
                : (delta.y > 0 ? RunAction.Jump : RunAction.Slide);
            OnAction?.Invoke(action);
        }
    }
}
