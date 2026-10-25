using System.Collections.Generic;
using UnityEngine;
using VELOX.Core;
using VELOX.Visuals;

namespace VELOX.Gameplay
{
    /// <summary>
    /// Procedural scrolling track for the endless runner. Spawns track
    /// segments, obstacles, coins, themed decorations and the custom in-game
    /// billboard ads (<see cref="CustomBillboardAd"/>) on both sides of the
    /// railway. Everything is pooled; nothing is destroyed at runtime.
    ///
    /// The world scrolls toward the player (objects move in -Z); the runner
    /// stays near the origin and only moves horizontally / vertically.
    /// </summary>
    public class TrackWorld : MonoBehaviour
    {
        [Header("Geometry")]
        public int lanes = 3;
        public float laneWidth = 2f;
        public float segmentLength = 10f;
        [Tooltip("Distance ahead of the player where content is kept populated.")]
        public float spawnAhead = 60f;
        [Tooltip("Content is recycled once it falls this far behind the player.")]
        public float recycleBehind = -12f;

        [Header("Content")]
        public VisualCatalog catalog;
        [Tooltip("If false, simple procedural placeholders are used.")]
        public bool useCatalog = true;

        [Header("Spawn tuning")]
        public float obstacleInterval = 9f;
        public float coinInterval = 6f;
        public float billboardInterval = 16f;
        public float decorationInterval = 22f;
        [Range(0f, 1f)] public float obstacleDensity = 0.55f;
        public float minSpeed = 8f;
        public float maxSpeed = 40f;

        public int LaneCount => lanes;
        public float LaneWidth => laneWidth;
        public float SegmentLength => segmentLength;
        public float ScrollSpeed { get; private set; }

        // ---- pools ----
        private readonly Stack<GameObject> _segmentPool = new Stack<GameObject>();
        private readonly Stack<GameObject> _obstaclePool = new Stack<GameObject>();
        private readonly Stack<GameObject> _coinPool = new Stack<GameObject>();
        private readonly Stack<GameObject> _billboardPool = new Stack<GameObject>();
        private readonly Stack<GameObject> _decorationPool = new Stack<GameObject>();

        // ---- active objects (segments ordered rear -> front) ----
        private readonly List<GameObject> _segments = new List<GameObject>();
        private readonly List<GameObject> _obstacles = new List<GameObject>();
        private readonly List<GameObject> _coins = new List<GameObject>();
        private readonly List<GameObject> _billboards = new List<GameObject>();
        private readonly List<GameObject> _decorations = new List<GameObject>();

        // ---- front spawn cursors ----
        private float _frontObstacleZ;
        private float _frontCoinZ;
        private float _frontBillboardZ;
        private float _frontDecorationZ;
        private bool _running;

        void Start()
        {
            if (useCatalog && catalog == null)
            {
                catalog = Resources.Load<VisualCatalog>("VisualCatalog");
                if (catalog == null)
                {
                    Debug.LogWarning("[VELOX] No VisualCatalog in Resources; using placeholders.");
                    useCatalog = false;
                }
            }

            int segments = Mathf.CeilToInt(spawnAhead / segmentLength) + 2;
            for (int i = 0; i < segments; i++)
                SpawnSegment(spawnAhead - i * segmentLength);

            _frontObstacleZ = spawnAhead;
            _frontCoinZ = spawnAhead;
            _frontBillboardZ = spawnAhead;
            _frontDecorationZ = spawnAhead;

            FillAll();
        }

        void Update()
        {
            float dz = -ScrollSpeed * Time.deltaTime;

            ScrollSegments(dz);
            MoveAll(_obstacles, dz);
            MoveAll(_coins, dz);
            MoveAll(_billboards, dz);
            MoveAll(_decorations, dz);

            if (!_running) return;

            RecycleBehind(_obstacles, _obstaclePool);
            RecycleBehind(_coins, _coinPool);
            RecycleBehind(_billboards, _billboardPool);
            RecycleBehind(_decorations, _decorationPool);

            FillAll();
        }

        // ---------------------------------------------------------------------
        // Segments (continuous strip, rotate rear -> front)
        // ---------------------------------------------------------------------

        private void ScrollSegments(float dz)
        {
            // _segments is ordered front (high Z, index 0) -> back (low Z, last).
            for (int i = 0; i < _segments.Count; i++)
            {
                Transform tr = _segments[i].transform;
                tr.position = new Vector3(0f, 0f, tr.position.z + dz);
            }

            if (_segments.Count == 0) return;

            // Rotate the rearmost segment to the front when it falls behind.
            Transform rear = _segments[_segments.Count - 1].transform;
            if (rear.position.z < recycleBehind)
            {
                _segments.RemoveAt(_segments.Count - 1);
                float frontZ = _segments.Count > 0
                    ? _segments[0].transform.position.z + segmentLength
                    : spawnAhead;
                rear.position = new Vector3(0f, 0f, frontZ);
                _segments.Insert(0, rear.gameObject);
            }
        }

        private void SpawnSegment(float z)
        {
            GameObject segment;

            if (useCatalog && catalog != null && catalog.TrackSegmentPrefab != null)
                segment = Instantiate(catalog.TrackSegmentPrefab, transform);
            else
                segment = ProceduralVisuals.MakeSegment(segmentLength, laneWidth * lanes);

            segment.transform.position = new Vector3(0f, 0f, z);
            _segments.Add(segment);
        }

        // ---------------------------------------------------------------------
        // Fill / spawn
        // ---------------------------------------------------------------------

        private void FillAll()
        {
            while (_obstacles.Count < TargetObstacles)
            {
                float z = _frontObstacleZ;
                SpawnObstacleChunk(z);
                _frontObstacleZ = z + obstacleInterval + Random.Range(-2f, 2f);
            }

            while (_coins.Count < TargetCoins)
            {
                float z = _frontCoinZ;
                SpawnCoinLine(z);
                _frontCoinZ = z + coinInterval + Random.Range(-1.5f, 1.5f);
            }

            while (_billboards.Count < TargetBillboards)
            {
                float z = _frontBillboardZ;
                SpawnBillboard(z);
                _frontBillboardZ = z + billboardInterval + Random.Range(-3f, 5f);
            }

            while (_decorations.Count < TargetDecorations)
            {
                float z = _frontDecorationZ;
                SpawnDecoration(z);
                _frontDecorationZ = z + decorationInterval + Random.Range(-4f, 8f);
            }
        }

        private int TargetObstacles => Mathf.Max(1, Mathf.RoundToInt(spawnAhead / obstacleInterval));
        private int TargetCoins => Mathf.Max(1, Mathf.RoundToInt(spawnAhead / coinInterval));
        private int TargetBillboards => Mathf.Max(1, Mathf.RoundToInt(spawnAhead / billboardInterval));
        private int TargetDecorations => Mathf.Max(1, Mathf.RoundToInt(spawnAhead / decorationInterval));

        private void SpawnObstacleChunk(float z)
        {
            int openLane = Random.Range(0, lanes);
            int blocked = Mathf.Clamp(
                Mathf.FloorToInt(obstacleDensity * 2f + Random.Range(-0.2f, 0.6f)),
                1, lanes - 1);

            for (int lane = 0; lane < lanes; lane++)
            {
                if (lane == openLane) continue;
                if (blocked-- <= 0) break;

                GameObject obs = PoolObstacle();
                if (obs == null) return;

                bool low = Random.value > 0.5f;
                Obstacle.Kind kind = Random.value > 0.78f
                    ? Obstacle.Kind.Block
                    : (low ? Obstacle.Kind.Jumpable : Obstacle.Kind.Slideable);

                obs.transform.position = new Vector3(
                    GetLaneX(lane),
                    ProceduralVisuals.ObstacleCenterY(kind),
                    z);

                Obstacle behaviour = obs.GetComponent<Obstacle>();
                if (behaviour != null) behaviour.Configure(kind);
                ProceduralVisuals.ConfigureObstacleCollider(obs, kind);
                ProceduralVisuals.ConfigureObstacleVisual(obs, kind);

                _obstacles.Add(obs);
            }

            if (Random.value > 0.5f)
                SpawnCoinLine(z, openLane, 4);
        }

        private void SpawnCoinLine(float z, int? lane = null, int count = 5)
        {
            int useLane = lane ?? Random.Range(0, lanes);
            float x = GetLaneX(useLane);

            for (int i = 0; i < count; i++)
            {
                GameObject coin = PoolCoin();
                if (coin == null) return;
                coin.transform.position = new Vector3(x, 0.8f, z + i * 1.6f);
                _coins.Add(coin);
            }
        }

        private void SpawnBillboard(float z)
        {
            bool left = Random.value > 0.5f;
            float x = left
                ? -(laneWidth * (lanes - 1) * 0.5f + 3.2f)
                : (laneWidth * (lanes - 1) * 0.5f + 3.2f);

            GameObject billboard = PoolBillboard();
            if (billboard == null) return;

            billboard.transform.position = new Vector3(x, 3.2f, z);
            billboard.transform.rotation = Quaternion.Euler(0f, left ? 90f : -90f, 0f);
            billboard.transform.localScale = new Vector3(
                catalog != null ? catalog.BillboardScale * 2.4f : 2.4f,
                catalog != null ? catalog.BillboardScale : 1f,
                1f);

            CustomBillboardAd ad = billboard.GetComponent<CustomBillboardAd>();
            if (ad != null && useCatalog && catalog != null)
            {
                if (catalog.BillboardAdFrames != null && catalog.BillboardAdFrames.Length > 0)
                    ad.SetFrames(catalog.BillboardAdFrames);
                else
                    ad.SetStaticTexture(catalog.BillboardStaticTexture);
            }

            _billboards.Add(billboard);
            ServiceLocator.Events?.onBillboardSpawned?.Invoke();
        }

        private void SpawnDecoration(float z)
        {
            bool left = Random.value > 0.5f;
            float x = left
                ? -(laneWidth * (lanes - 1) * 0.5f + 7f)
                : (laneWidth * (lanes - 1) * 0.5f + 7f);

            GameObject deco = PoolDecoration();
            if (deco == null) return;

            deco.transform.position = new Vector3(x, 0f, z);
            deco.transform.rotation = Quaternion.Euler(0f, left ? 180f : 0f, 0f);
            _decorations.Add(deco);
        }

        // ---------------------------------------------------------------------
        // Pooling helpers
        // ---------------------------------------------------------------------

        private GameObject PoolObstacle()
        {
            if (_obstaclePool.Count > 0) return _obstaclePool.Pop();

            if (useCatalog && catalog != null && catalog.ObstaclePrefab != null)
                return Instantiate(catalog.ObstaclePrefab, transform);

            return ProceduralVisuals.MakeObstacle(Obstacle.Kind.Jumpable);
        }

        private GameObject PoolCoin()
        {
            if (_coinPool.Count > 0) return _coinPool.Pop();

            if (useCatalog && catalog != null && catalog.CoinPrefab != null)
                return Instantiate(catalog.CoinPrefab, transform);

            return ProceduralVisuals.MakeCoin();
        }

        private GameObject PoolBillboard()
        {
            if (_billboardPool.Count > 0) return _billboardPool.Pop();

            if (useCatalog && catalog != null && catalog.BillboardPrefab != null)
                return Instantiate(catalog.BillboardPrefab, transform);

            return ProceduralVisuals.MakeBillboard();
        }

        private GameObject PoolDecoration()
        {
            if (_decorationPool.Count > 0) return _decorationPool.Pop();

            if (useCatalog && catalog != null && catalog.DecorationPrefab != null)
                return Instantiate(catalog.DecorationPrefab, transform);

            return ProceduralVisuals.MakeDecoration();
        }

        private static void MoveAll(List<GameObject> list, float dz)
        {
            for (int i = 0; i < list.Count; i++)
            {
                Transform tr = list[i].transform;
                tr.position = new Vector3(tr.position.x, tr.position.y, tr.position.z + dz);
            }
        }

        private void RecycleBehind(List<GameObject> list, Stack<GameObject> pool)
        {
            for (int i = list.Count - 1; i >= 0; i--)
            {
                if (list[i].transform.position.z < recycleBehind)
                    Recycle(list, pool, list[i]);
            }
        }

        private void Recycle(List<GameObject> list, Stack<GameObject> pool, GameObject go)
        {
            if (go == null) return;
            list.Remove(go);
            go.SetActive(false);
            pool.Push(go);
            ServiceLocator.Events?.onBillboardReleased?.Invoke();
        }

        public float GetLaneX(int lane)
        {
            float half = (lanes - 1) * 0.5f;
            return (lane - half) * laneWidth;
        }

        // ---------------------------------------------------------------------
        // Public API
        // ---------------------------------------------------------------------

        public void SetSpeed(float speed) => ScrollSpeed = Mathf.Clamp(speed, minSpeed, maxSpeed);

        /// <summary>Menu ambient scrolling (no gameplay content).</summary>
        public void IdleScroll(float speed) => ScrollSpeed = Mathf.Clamp(speed, 3f, 20f);

        public void Reset()
        {
            _running = false;

            foreach (GameObject go in _obstacles) Recycle(_obstacles, _obstaclePool, go);
            foreach (GameObject go in _coins) Recycle(_coins, _coinPool, go);
            foreach (GameObject go in _billboards) Recycle(_billboards, _billboardPool, go);
            foreach (GameObject go in _decorations) Recycle(_decorations, _decorationPool, go);

            _frontObstacleZ = spawnAhead;
            _frontCoinZ = spawnAhead;
            _frontBillboardZ = spawnAhead;
            _frontDecorationZ = spawnAhead;

            ScrollSpeed = 0f;
        }

        public void Stop() => _running = false;

        public void StartRunning() => _running = true;
    }
}
