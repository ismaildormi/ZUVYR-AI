using UnityEngine; using Velox.Core;
namespace Velox.Player
{
    /// <summary>Smooth chase camera; auto-binds to the hero spawned by SceneBootstrapper (assigned or procedural NEO).</summary>
    public sealed class CameraFollow : MonoBehaviour
    {
        [SerializeField] private Vector3 offset = new Vector3(0f, 5.2f, -7.5f);
        [SerializeField] private float followSpeed = 6f, lookAhead = 6f;
        [SerializeField] private SceneBootstrapper bootstrapper;
        private Transform target;
        private void LateUpdate()
        { if (!target) { var b = bootstrapper ? bootstrapper.SpawnedHero : null; target = b ? b.transform : null; if (!target) return; }
          Vector3 want = target.position + offset;
          transform.position = Vector3.Lerp(transform.position, want, followSpeed * Time.deltaTime);
          transform.LookAt(target.position + Vector3.forward * lookAhead + Vector3.up * 1.2f); }
    }
}
