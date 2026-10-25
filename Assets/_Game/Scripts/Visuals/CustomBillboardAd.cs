using UnityEngine;
using UnityEngine.UI;

namespace VELOX.Visuals
{
    /// <summary>
    /// Custom in-game advertising billboard. Renders a manually-assigned set of
    /// <see cref="Texture2D"/> slots as a static image or a simple animation,
    /// without any external ad network.
    ///
    /// Design:
    /// - Drop this component on a billboard panel in the scene.
    /// - Attach a world-space <see cref="Canvas"/> with a <see cref="RawImage"/>
    ///   (the usual setup), OR leave the canvas off and use a <see cref="Renderer"/>
    ///   material instead.
    /// - Fill the <see cref="frames"/> array in the Inspector with your ad
    ///   textures. One texture = static ad. Several textures = animated ad.
    /// - Set <see cref="animated"/> to cycle frames, or call
    ///   <see cref="SetStaticTexture"/> for a single image.
    /// - <see cref="TrackWorld"/> assigns frames from the <see cref="VisualCatalog"/>
    ///   at spawn time.
    /// </summary>
    public class CustomBillboardAd : MonoBehaviour
    {
        [Header("Manual ad slots")]
        [Tooltip("Ad frames. Assign in the Inspector; 1 = static, >1 = animated.")]
        public Texture2D[] frames;

        [Tooltip("Fallback single texture when no frames are assigned.")]
        public Texture2D staticTexture;

        [Header("Presentation")]
        public bool faceCamera = true;
        public bool doubleSided = true;
        public bool useWorldSpaceCanvas = false;
        public Vector2 billboardSize = new Vector2(4f, 2f);
        public Color tint = Color.white;

        [Header("Animation")]
        public bool animated = true;
        [Range(0.05f, 3f)] public float frameInterval = 0.35f;
        public bool loop = true;
        public int startFrame;

        [Header("Debug")]
        public bool showFrameIndicator = false;

        private RawImage _rawImage;
        private Canvas _canvas;
        private Renderer _renderer;
        private Material _material;
        private bool _playing;
        private float _timer;
        private int _index;
        private bool _ready;

        public int FrameCount => frames != null ? frames.Length : 0;
        public bool IsPlaying => _playing;
        public int CurrentFrame => _index;

        void Awake()
        {
            _canvas = GetComponent<Canvas>();
            _rawImage = useWorldSpaceCanvas ? GetComponentInChildren<RawImage>(true) : null;

            if (_rawImage == null && useWorldSpaceCanvas)
                _rawImage = GetComponent<RawImage>();

            _renderer = GetComponent<Renderer>();
            if (_renderer == null) _renderer = GetComponentInChildren<Renderer>(true);

            Prepare();
            _index = ClampFrame(startFrame);
            ApplyFrame(_index);

            // Ads animate while the game runs; callers may also drive this.
            _playing = animated && FrameCount > 1;
            _timer = 0f;
            _ready = true;
        }

        void Update()
        {
            if (!_playing || FrameCount <= 1) return;

            _timer += Time.deltaTime;
            if (_timer >= frameInterval)
            {
                _timer = 0f;
                int next = _index + 1;

                if (next >= FrameCount)
                {
                    if (!loop) { _playing = false; return; }
                    next = 0;
                }

                SetFrame(next);
            }
        }

        void LateUpdate()
        {
            if (!faceCamera || !_ready) return;

            Camera cam = Camera.main;
            if (cam == null) return;

            Vector3 forward = cam.transform.position - transform.position;
            if (forward.sqrMagnitude < 0.0001f) return;

            transform.rotation = Quaternion.LookRotation(forward);
        }

        private void Prepare()
        {
            if (_rawImage != null)
            {
                _rawImage.enabled = true;
                _rawImage.preserveAspect = true;
                if (_canvas != null)
                    _canvas.worldCamera = Camera.main;

                RectTransform rect = _rawImage.rectTransform;
                rect.sizeDelta = billboardSize;
                _rawImage.color = tint;
            }

            if (_renderer != null)
            {
                if (_material == null)
                {
                    _material = new Material(Shader.Find("Standard"));
                    _material.mainTextureScale = Vector2.one;
                }
                _renderer.material = _material;
            }
        }

        /// <summary>Assign a new frame set (called by <see cref="TrackWorld"/>).</summary>
        public void SetFrames(Texture2D[] newFrames)
        {
            frames = newFrames;
            animated = newFrames != null && newFrames.Length > 1;
            _index = ClampFrame(startFrame);
            ApplyFrame(_index);
            _playing = animated && FrameCount > 1;
            _timer = 0f;
        }

        /// <summary>Show a single static texture.</summary>
        public void SetStaticTexture(Texture2D texture)
        {
            frames = texture != null ? new[] { texture } : null;
            animated = false;
            ApplyFrame(0);
            _playing = false;
        }

        public void SetFrame(int index)
        {
            _index = ClampFrame(index);
            ApplyFrame(_index);
        }

        public void Play()
        {
            if (FrameCount <= 1) return;
            _playing = true;
            _timer = 0f;
        }

        public void Stop() => _playing = false;

        public void Reset()
        {
            _playing = false;
            _index = ClampFrame(startFrame);
            ApplyFrame(_index);
        }

        private int ClampFrame(int index)
        {
            int count = FrameCount;
            if (count <= 0)
                return staticTexture != null ? 0 : 0;
            return Mathf.Clamp(index, 0, count - 1);
        }

        private void ApplyFrame(int index)
        {
            Texture2D texture = frames != null && index >= 0 && index < frames.Length
                ? frames[index]
                : staticTexture;

            if (_rawImage != null)
                _rawImage.texture = texture;

            if (_material != null)
                _material.mainTexture = texture;

            if (showFrameIndicator && _rawImage != null && texture != null)
                Debug.Log($"[VELOX] Billboard frame {index}/{FrameCount} applied.");
        }

        private void OnDestroy()
        {
            if (_material != null)
                Destroy(_material);
        }
    }
}
