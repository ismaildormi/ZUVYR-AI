using UnityEngine; using Velox.Core;
namespace Velox.Player
{
    /// <summary>
    /// Procedural runner animation for NEO — no Animator/clips required (an Animator, if later assigned
    /// via VisualCatalog, simply overrides this). Drives the factory pivots: opposite arm/leg swing scaled
    /// by speed, vertical bob, forward lean, lane-change bank, airborne tuck and slide pose.
    /// </summary>
    public sealed class NeoRunnerMotion : MonoBehaviour
    {
        [SerializeField] private float swingDegrees = 52f, bobHeight = 0.07f, leanDegrees = 9f;
        private Transform hips, torso, armL, armR, legL, legR, elbowL, elbowR, kneeL, kneeR; private float phase; private Vector3 hipsBase; private float bank;
        private void Awake()
        { hips = transform.Find("Hips"); if (!hips) { enabled = false; return; }
          torso = hips.Find("Torso"); armL = torso.Find("Arm_L"); armR = torso.Find("Arm_R"); legL = hips.Find("Leg_L"); legR = hips.Find("Leg_R");
          elbowL = armL.Find("Elbow"); elbowR = armR.Find("Elbow"); kneeL = legL.Find("Knee"); kneeR = legR.Find("Knee"); hipsBase = hips.localPosition; }
        private void Update()
        {
            var g = GameManager.Instance; bool playing = g && g.State == GameState.Playing;
            float speed = playing ? g.Speed : 0f; phase += Time.deltaTime * (2.2f + speed * 0.55f);
            float s = Mathf.Sin(phase), c = Mathf.Cos(phase); float amp = playing ? 1f : 0.12f; // idle sway in menu
            bool airborne = transform.position.y > 0.15f; bool sliding = Input.GetKey(KeyCode.DownArrow); // pose hint; PlayerController owns physics
            SetRot(legL, airborne ? -55f :  s * swingDegrees * amp, 0, 0); SetRot(legR, airborne ? 35f : -s * swingDegrees * amp, 0, 0);
            SetRot(armL, airborne ? -70f : -s * swingDegrees * 0.85f * amp, 0,  6f); SetRot(armR, airborne ? 40f : s * swingDegrees * 0.85f * amp, 0, -6f);
            SetRot(elbowL, -38f - Mathf.Max(0f,  c) * 26f * amp, 0, 0); SetRot(elbowR, -38f - Mathf.Max(0f, -c) * 26f * amp, 0, 0);
            SetRot(kneeL, airborne ? 70f : Mathf.Max(0f, -s) * 58f * amp, 0, 0); SetRot(kneeR, airborne ? 18f : Mathf.Max(0f, s) * 58f * amp, 0, 0);
            float targetBank = playing ? -Input.GetAxisRaw("Horizontal") * 14f : 0f; bank = Mathf.Lerp(bank, targetBank, Time.deltaTime * 8f);
            hips.localPosition = hipsBase + new Vector3(0f, (sliding ? -0.42f : Mathf.Abs(c) * bobHeight * amp) - (airborne ? 0.05f : 0f), 0f);
            hips.localRotation = Quaternion.Euler(sliding ? -38f : leanDegrees * amp + (airborne ? -8f : 0f), 0f, bank);
            if (torso) torso.localRotation = Quaternion.Euler(0f, s * 6f * amp, bank * 0.35f);
        }
        private static void SetRot(Transform t, float x, float y, float z) { if (t) t.localRotation = Quaternion.Euler(x, y, z); }
    }
}
