using UnityEngine;
using VELOX.Core;

namespace VELOX.Gameplay
{
    /// <summary>
    /// Drives the runner character (NEO): lane switching, jumping, sliding and
    /// collision resolution. Keeps movement smooth with frame-rate independent
    /// lerps and a simple gravity model. The character itself stays near the
    /// origin while the world scrolls toward it (see <see cref="TrackWorld"/>).
    /// </summary>
    public class RunnerMotor : MonoBehaviour
    {
        [Header("Lanes")]
        [Tooltip("Referenced to read lane geometry. Falls back to local defaults if null.")]
        public TrackWorld trackWorld;
        public int lanes = 3;
        public float laneWidth = 2f;

        [Header("Movement")]
        public float laneLerp = 14f;
        public float gravity = -38f;
        public float jumpVelocity = 13f;
        public float slideDuration = 0.6f;
        public float groundY = 0.15f;
        public float airCutCancelThreshold = 0.4f;

        [Header("Input")]
        public bool enableTouch = true;
        public bool enableKeyboard = true;
        public bool enableGamepad = true;

        [Header("Animator (optional)")]
        public Animator animator;
        public string speedParam = "Speed";
        public string airborneParam = "IsAirborne";
        public string slidingParam = "IsSliding";

        public int Lane => _lane;
        public int TargetLane => _targetLane;
        public bool IsGrounded => _grounded;
        public bool IsSliding => _sliding;

        private int _lane;
        private int _targetLane;
        private Vector3 _basePos;
        private float _velocityY;
        private bool _grounded;
        private bool _sliding;
        private float _slideTimer;
        private float _speed;
        private bool _stopped;

        // touch swipe tracking
        private Vector2 _touchStart;
        private float _touchStartTime;
        private bool _touching;

        void Awake()
        {
            EnsureCollider();
        }

        /// <summary>
        /// Guarantees the runner has a trigger collider + a kinematic
        /// Rigidbody so obstacle/coin overlaps are detected. Kinematic means
        /// the runner is unaffected by physics (movement is transform-driven)
        /// yet still triggers collision events.
        /// </summary>
        private void EnsureCollider()
        {
            if (GetComponent<Rigidbody>() == null)
            {
                Rigidbody rb = gameObject.AddComponent<Rigidbody>();
                if (rb != null)
                {
                    rb.isKinematic = true;
                    rb.useGravity = false;
                    rb.constraints = RigidbodyConstraints.FreezeRotation;
                }
            }

            Collider existing = GetComponent<Collider>();
            if (existing != null)
            {
                existing.isTrigger = true;
                return;
            }

            BoxCollider box = gameObject.AddComponent<BoxCollider>();
            if (box == null) return;
            box.isTrigger = true;
            box.size = new Vector3(1.0f, 1.4f, 0.5f);
            box.center = new Vector3(0f, 0.7f, 0f);
        }

        void Start()
        {
            _basePos = transform.position;
            _lane = lanes / 2;
            _targetLane = _lane;

            if (trackWorld != null)
            {
                lanes = trackWorld.LaneCount;
                laneWidth = trackWorld.LaneWidth;
            }

            _grounded = true;
        }

        void Update()
        {
            if (_stopped) return;

            HandleInput();
            MoveLane();
            JumpPhysics();
            UpdateSlide();
            SyncAnimator();
        }

        private void HandleInput()
        {
            if (enableKeyboard)
            {
                float h = Input.GetAxisRaw("Horizontal");
                if (h < -0.5f) MoveLaneBy(-1);
                else if (h > 0.5f) MoveLaneBy(1);

                if (Input.GetKeyDown(KeyCode.UpArrow) || Input.GetKeyDown(KeyCode.W)) Jump();
                if (Input.GetKeyDown(KeyCode.DownArrow) || Input.GetKeyDown(KeyCode.S)) Slide();
            }

            if (enableGamepad)
            {
                float gx = Input.GetAxisRaw("Horizontal");
                if (Mathf.Abs(gx) > 0.5f) MoveLaneBy(gx < 0 ? -1 : 1);
                if (Input.GetButtonDown("Jump")) Jump();
                if (Input.GetButtonDown("Fire3")) Slide();
            }

            if (enableTouch) HandleTouch();
        }

        private void HandleTouch()
        {
            if (Input.touchCount == 0)
            {
                _touching = false;
                return;
            }

            Touch t = Input.GetTouch(0);
            if (t.phase == TouchPhase.Began)
            {
                _touching = true;
                _touchStart = t.position;
                _touchStartTime = Time.time;
            }
            else if (_touching && t.phase == TouchPhase.Ended)
            {
                Vector2 delta = t.position - _touchStart;
                float duration = Time.time - _touchStartTime;

                const float swipeMin = 24f;
                if (delta.magnitude < swipeMin)
                {
                    // Tap = jump.
                    if (duration < 0.25f) Jump();
                }
                else
                {
                    Vector2 dir = delta.normalized;
                    if (Mathf.Abs(dir.x) > Mathf.Abs(dir.y))
                        MoveLaneBy(dir.x < 0 ? -1 : 1);
                    else if (dir.y > 0)
                        Jump();
                    else
                        Slide();
                }
                _touching = false;
            }
        }

        private void MoveLane()
        {
            float targetX = _basePos.x + GetLaneOffset(_targetLane);
            if (_sliding) targetX = transform.position.x; // freeze x while sliding

            transform.position = new Vector3(
                Mathf.Lerp(transform.position.x, targetX, Mathf.Clamp01(laneLerp * Time.deltaTime)),
                transform.position.y,
                _basePos.z);
        }

        private void JumpPhysics()
        {
            if (_velocityY != 0f || !_grounded)
            {
                _velocityY += gravity * Time.deltaTime;
                float y = transform.position.y + _velocityY * Time.deltaTime;

                if (y <= groundY)
                {
                    y = groundY;
                    _velocityY = 0f;
                    _grounded = true;
                }
                else
                {
                    _grounded = false;
                }

                transform.position = new Vector3(transform.position.x, y, _basePos.z);
            }
        }

        private void UpdateSlide()
        {
            if (!_sliding) return;

            _slideTimer -= Time.deltaTime;
            if (_slideTimer <= 0f)
            {
                _sliding = false;
                transform.localScale = Vector3.one;
                transform.position = new Vector3(transform.position.x, groundY, _basePos.z);
            }
        }

        private void SyncAnimator()
        {
            if (animator == null) return;

            if (animator.HasParameter(speedParam)) animator.SetFloat(speedParam, _speed * 0.1f);
            if (animator.HasParameter(airborneParam)) animator.SetBool(airborneParam, !_grounded);
            if (animator.HasParameter(slidingParam)) animator.SetBool(slidingParam, _sliding);
        }

        public float GetLaneOffset(int laneIndex)
        {
            float half = (lanes - 1) * 0.5f;
            return (laneIndex - half) * laneWidth;
        }

        public void MoveLaneBy(int delta)
        {
            int next = Mathf.Clamp(_targetLane + delta, 0, lanes - 1);
            if (next != _targetLane)
            {
                _targetLane = next;
                _lane = next;
            }
        }

        public void Jump()
        {
            if (!_grounded || _sliding) return;
            _velocityY = jumpVelocity;
            _grounded = false;
        }

        public void Slide()
        {
            if (!_grounded)
            {
                // Allow a "fast-fall" style slide cancel mid-air.
                if (_velocityY < -airCutCancelThreshold)
                {
                    _velocityY = jumpVelocity * -0.25f;
                }
                return;
            }

            _sliding = true;
            _slideTimer = slideDuration;
            transform.localScale = new Vector3(1f, 0.55f, 1f);
        }

        /// <summary>Sets forward/scroll speed (used for animator cadence).</summary>
        public void SetSpeed(float speed) => _speed = speed;

        public void Reset()
        {
            _lane = lanes / 2;
            _targetLane = _lane;
            _velocityY = 0f;
            _grounded = true;
            _sliding = false;
            _slideTimer = 0f;
            _stopped = false;
            _speed = 0f;
            transform.position = new Vector3(_basePos.x + GetLaneOffset(_lane), groundY, _basePos.z);
            transform.localScale = Vector3.one;
        }

        public void Stop() => _stopped = true;

        /// <summary>Freezes/unfreezes input+movement without resetting position.</summary>
        public void SetStopped(bool stopped) => _stopped = stopped;

        private void OnTriggerEnter(Collider other)
        {
            if (other == null) return;

            // Component-based detection (no tag dependency). Any obstacle
            // contact ends the run; jumping/sliding/lane selection are the
            // only ways to avoid it.
            Obstacle obstacle = other.GetComponent<Obstacle>();
            if (obstacle != null)
            {
                if (obstacle.IgnoreCollision) return;
                OnDeath();
                return;
            }

            Collectible coin = other.GetComponent<Collectible>();
            if (coin != null) coin.Collect();
        }

        private void OnDeath()
        {
            GameDirector.Instance?.OnPlayerDied();
        }
    }
}
