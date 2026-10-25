using UnityEngine;
using VELOX.Gameplay;

namespace VELOX.Visuals
{
    /// <summary>
    /// Creates the lightweight, asset-free visuals used when no
    /// <see cref="VisualCatalog"/> prefabs are assigned. Everything is built
    /// from Unity primitives + shared materials so the game is fully playable
    /// in a fresh project with no imported art.
    ///
    /// These helpers are deliberately procedural and dependency-free: real
    /// projects can swap in catalog prefabs without touching gameplay code.
    /// </summary>
    public static class ProceduralVisuals
    {
        // ---- shared materials (created lazily, reused) ----
        private static Material _runnerMat;
        private static Material _trackMat;
        private static Material _railMat;
        private static Material _obstacleJump;
        private static Material _obstacleSlide;
        private static Material _obstacleBlock;
        private static Material _coinMat;
        private static Material _billboardMat;
        private static Material _trunkMat;
        private static Material _foliageMat;

        private static Material Mat(ref Material m, Color color)
        {
            if (m == null)
            {
                m = new Material(Shader.Find("Standard"));
                m.mainTextureScale = Vector2.one;
            }
            m.color = color;
            return m;
        }

        private static void ApplyMat(GameObject go, ref Material m, Color color)
        {
            Renderer r = go.GetComponent<Renderer>();
            if (r != null) r.material = Mat(ref m, color);
        }

        /// <summary>Removes any collider (track geometry never collides).</summary>
        private static void StripCollider(GameObject go)
        {
            Collider c = go.GetComponent<Collider>();
            if (c != null) Object.Destroy(c);
        }

        // ---------------------------------------------------------------------
        // Runner (NEO) — a capsule body + sphere head. Parent under the
        // RunnerMotor GameObject so the motor keeps control of position/scale.
        // ---------------------------------------------------------------------
        public static GameObject MakeRunnerVisual()
        {
            GameObject body = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            body.name = "NEO_Body";
            body.transform.localScale = new Vector3(0.85f, 0.95f, 0.85f);
            ApplyMat(body, ref _runnerMat, new Color(0.18f, 0.55f, 0.95f, 1f));
            StripCollider(body);

            GameObject head = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            head.name = "NEO_Head";
            head.transform.SetParent(body.transform);
            head.transform.localPosition = new Vector3(0f, 1.0f, 0f);
            head.transform.localScale = Vector3.one * 0.45f;
            ApplyMat(head, ref _runnerMat, new Color(0.95f, 0.85f, 0.7f, 1f));
            StripCollider(head);

            return body;
        }

        // ---------------------------------------------------------------------
        // Track segment — a bed slab + two rails. Returns a parent GameObject
        // whose transform the TrackWorld positions along Z.
        // ---------------------------------------------------------------------
        public static GameObject MakeSegment(float length, float width)
        {
            GameObject segment = new GameObject("TrackSegment");

            GameObject bed = GameObject.CreatePrimitive(PrimitiveType.Cube);
            bed.name = "Bed";
            bed.transform.SetParent(segment.transform);
            bed.transform.localPosition = Vector3.zero;
            bed.transform.localScale = new Vector3(width, 0.12f, length);
            ApplyMat(bed, ref _trackMat, new Color(0.28f, 0.28f, 0.30f, 1f));
            StripCollider(bed);

            float railX = width * 0.42f;
            for (int i = -1; i <= 1; i += 2)
            {
                GameObject rail = GameObject.CreatePrimitive(PrimitiveType.Cube);
                rail.name = "Rail" + (i < 0 ? "L" : "R");
                rail.transform.SetParent(segment.transform);
                rail.transform.localPosition = new Vector3(i * railX, 0.06f, 0f);
                rail.transform.localScale = new Vector3(0.10f, 0.05f, length);
                ApplyMat(rail, ref _railMat, new Color(0.65f, 0.65f, 0.68f, 1f));
                StripCollider(rail);
            }

            return segment;
        }

        // ---------------------------------------------------------------------
        // Obstacle — sized per kind so jump / slide / block are all achievable.
        // ---------------------------------------------------------------------
        public static Vector3 ObstacleHalfSize(Obstacle.Kind kind)
        {
            switch (kind)
            {
                case Obstacle.Kind.Jumpable:  return new Vector3(0.70f, 0.30f, 0.40f); // low: jump over
                case Obstacle.Kind.Slideable: return new Vector3(0.70f, 0.25f, 0.40f); // mid bar: slide under
                default:                       return new Vector3(0.70f, 1.40f, 0.40f); // tall wall: switch lane
            }
        }

        public static float ObstacleCenterY(Obstacle.Kind kind)
        {
            switch (kind)
            {
                case Obstacle.Kind.Jumpable:  return 0.35f;
                case Obstacle.Kind.Slideable: return 1.20f;
                default:                       return 1.10f;
            }
        }

        public static GameObject MakeObstacle(Obstacle.Kind kind)
        {
            GameObject go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = "Obstacle";
            ConfigureObstacleCollider(go, kind);
            ConfigureObstacleVisual(go, kind);
            Obstacle obs = go.GetComponent<Obstacle>();
            if (obs == null) obs = go.AddComponent<Obstacle>();
            obs.Configure(kind);
            return go;
        }

        /// <summary>Sets the per-kind visual scale + colour (shared materials).</summary>
        public static void ConfigureObstacleVisual(GameObject go, Obstacle.Kind kind)
        {
            switch (kind)
            {
                case Obstacle.Kind.Slideable:
                    go.transform.localScale = new Vector3(1.4f, 0.30f, 0.8f);
                    ApplyMat(go, ref _obstacleSlide, new Color(0.95f, 0.75f, 0.20f, 1f));
                    break;
                case Obstacle.Kind.Block:
                    go.transform.localScale = new Vector3(1.4f, 2.8f, 0.8f);
                    ApplyMat(go, ref _obstacleBlock, new Color(0.85f, 0.30f, 0.85f, 1f));
                    break;
                default:
                    go.transform.localScale = new Vector3(1.4f, 0.6f, 0.8f);
                    ApplyMat(go, ref _obstacleJump, new Color(0.95f, 0.35f, 0.30f, 1f));
                    break;
            }
        }

        /// <summary>
        /// Re-applies the per-kind collider to a pooled obstacle. Safe to call
        /// on prefabs that carry a BoxCollider; prefabs with other collider
        /// types are left untouched.
        /// </summary>
        public static void ConfigureObstacleCollider(GameObject go, Obstacle.Kind kind)
        {
            BoxCollider box = go.GetComponent<BoxCollider>();
            if (box == null) return;

            Vector3 half = ObstacleHalfSize(kind);
            box.size = new Vector3(half.x * 2f, half.y * 2f, half.z * 2f);
            box.center = new Vector3(0f, ObstacleCenterY(kind), 0f);
            box.isTrigger = true;
        }

        // ---------------------------------------------------------------------
        // Coin — a gold sphere with a trigger sphere collider.
        // ---------------------------------------------------------------------
        public static GameObject MakeCoin()
        {
            GameObject go = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            go.name = "Coin";
            go.transform.localScale = Vector3.one * 0.45f;
            ApplyMat(go, ref _coinMat, new Color(1f, 0.84f, 0.20f, 1f));

            SphereCollider col = go.GetComponent<SphereCollider>();
            if (col == null) col = go.AddComponent<SphereCollider>();
            col.radius = 0.6f;
            col.isTrigger = true;

            Collectible c = go.GetComponent<Collectible>();
            if (c == null) c = go.AddComponent<Collectible>();
            return go;
        }

        // ---------------------------------------------------------------------
        // Billboard — a plane that renders the ad via a material (no canvas
        // required). CustomBillboardAd swaps the material's main texture.
        // ---------------------------------------------------------------------
        public static GameObject MakeBillboard()
        {
            GameObject go = GameObject.CreatePrimitive(PrimitiveType.Plane);
            go.name = "Billboard";
            ApplyMat(go, ref _billboardMat, new Color(0.9f, 0.9f, 0.92f, 1f));

            CustomBillboardAd ad = go.GetComponent<CustomBillboardAd>();
            if (ad == null) ad = go.AddComponent<CustomBillboardAd>();
            return go;
        }

        // ---------------------------------------------------------------------
        // Decoration — a simple tree (trunk + foliage sphere).
        // ---------------------------------------------------------------------
        public static GameObject MakeDecoration()
        {
            GameObject tree = new GameObject("Decoration");

            GameObject trunk = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            trunk.name = "Trunk";
            trunk.transform.SetParent(tree.transform);
            trunk.transform.localPosition = new Vector3(0f, 1.0f, 0f);
            trunk.transform.localScale = new Vector3(0.4f, 2.0f, 0.4f);
            ApplyMat(trunk, ref _trunkMat, new Color(0.45f, 0.28f, 0.15f, 1f));
            StripCollider(trunk);

            GameObject foliage = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            foliage.name = "Foliage";
            foliage.transform.SetParent(tree.transform);
            foliage.transform.localPosition = new Vector3(0f, 2.6f, 0f);
            foliage.transform.localScale = new Vector3(1.2f, 1.0f, 1.2f);
            ApplyMat(foliage, ref _foliageMat, new Color(0.25f, 0.65f, 0.30f, 1f));
            StripCollider(foliage);

            return tree;
        }
    }
}
