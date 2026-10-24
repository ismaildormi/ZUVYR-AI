using UnityEngine;
using UltimateFootballChase.Gameplay;

namespace UltimateFootballChase.CameraSystem
{
    public sealed class ChaseCamera : MonoBehaviour
    {
        private Transform runner;
        private Vector3 normalOffset = new Vector3(0, 5.8f, -10f); // provisional portrait framing
        private bool cinematic;
        private float replayProgress;
        public void Initialize(Transform player)
        {
            runner = player;
            SnapNormal();
        }
        public void SnapNormal()
        {
            cinematic = false;
            transform.position = runner.position + normalOffset;
            transform.LookAt(runner.position + Vector3.forward * 12f + Vector3.up * .3f);
        }
        public void SetReplayAngle(float progress)
        {
            cinematic = true;
            replayProgress = progress;
            PositionReplay();
        }
        private void PositionReplay()
        {
            // Two distinct VAR angles; the third cut is a low-angle view of the collision.
            Vector3 offset = replayProgress < .35f ? new Vector3(-5, 3, -4) :
                replayProgress < .7f ? new Vector3(5, 4, 1) : new Vector3(0, 2.5f, -5);
            transform.position = runner.position + offset;
            transform.LookAt(runner.position + Vector3.up * 1f);
        }
        private void LateUpdate()
        {
            if (runner == null || cinematic) return;
            Vector3 target = new Vector3(runner.position.x * .32f, 0, 0) + normalOffset;
            transform.position = Vector3.Lerp(transform.position, target, 1f - Mathf.Exp(-7f * Time.unscaledDeltaTime));
            transform.LookAt(new Vector3(runner.position.x * .32f, 1f, 12f));
        }
    }
}
