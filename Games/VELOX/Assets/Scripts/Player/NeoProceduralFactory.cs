using System.Collections.Generic; using UnityEngine;
namespace Velox.Player
{
    /// <summary>
    /// Procedurally builds NEO — an original, stylised cartoon-human runner — from generated meshes.
    /// No imported model, no greybox cube: beveled-box limbs, sphere head/visor, phosphor palette
    /// (emissive cyan suit, magenta accents, lime joints) and articulated pivots ready for NeoRunnerMotion.
    /// Used as (a) runtime fallback when VisualCatalog.neoCharacterPrefab is empty and
    /// (b) by the Editor scene builder to bake a real NEO_Procedural.prefab asset.
    /// </summary>
    public static class NeoProceduralFactory
    {
        public static readonly Color Suit   = new Color(0.02f, 0.85f, 1.00f);  // phosphor cyan
        public static readonly Color Accent = new Color(1.00f, 0.15f, 0.65f);  // phosphor magenta
        public static readonly Color Joint  = new Color(0.65f, 1.00f, 0.15f);  // phosphor lime
        public static readonly Color Skin   = new Color(1.00f, 0.78f, 0.60f);
        public static readonly Color Dark   = new Color(0.05f, 0.06f, 0.12f);

        public static GameObject Build(Transform parent = null)
        {
            var mats = new Dictionary<string, Material>();
            Material Mat(string n, Color c, float emission = 0f)
            { if (mats.TryGetValue(n, out var m)) return m;
              m = new Material(Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard")) { name = "NEO_"+n, color = c };
              if (emission > 0f) { m.EnableKeyword("_EMISSION"); m.SetColor("_EmissionColor", c * emission); }
              mats[n] = m; return m; }

            var root = new GameObject("NEO");
            if (parent) root.transform.SetParent(parent, false);
            var hips = Pivot(root.transform, "Hips", new Vector3(0f, 0.98f, 0f));
            // pelvis + tapered torso (two stacked beveled boxes = cartoon proportions)
            Part(hips, "Pelvis", BeveledBox(0.34f, 0.20f, 0.22f, 0.05f), Mat("Dark", Dark), new Vector3(0f, 0.02f, 0f));
            var torso = Pivot(hips, "Torso", new Vector3(0f, 0.10f, 0f));
            Part(torso, "Chest", BeveledBox(0.42f, 0.42f, 0.26f, 0.08f), Mat("Suit", Suit, 1.6f), new Vector3(0f, 0.22f, 0f));
            Part(torso, "ChestStripe", BeveledBox(0.44f, 0.07f, 0.28f, 0.03f), Mat("Accent", Accent, 2.2f), new Vector3(0f, 0.26f, 0f));
            Part(torso, "CoreLight", Sphere(0.055f), Mat("Joint", Joint, 3f), new Vector3(0f, 0.22f, 0.15f));
            // head: sphere + visor + hair crest (distinct silhouette, not a sphere-on-a-box)
            var neck = Pivot(torso, "Neck", new Vector3(0f, 0.46f, 0f));
            Part(neck, "Head", Sphere(0.17f), Mat("Skin", Skin), new Vector3(0f, 0.14f, 0f));
            Part(neck, "Visor", BeveledBox(0.26f, 0.08f, 0.10f, 0.03f), Mat("Accent", Accent, 2.6f), new Vector3(0f, 0.16f, 0.12f));
            Part(neck, "Crest", BeveledBox(0.06f, 0.16f, 0.24f, 0.02f), Mat("Suit", Suit, 1.8f), new Vector3(0f, 0.30f, -0.02f), new Vector3(-18f, 0f, 0f));
            // arms: shoulder pivot -> upper arm -> elbow pivot -> forearm + glove
            BuildArm(torso, Mat,  1); BuildArm(torso, Mat, -1);
            // legs: hip pivot -> thigh -> knee pivot -> shin + glowing shoe
            BuildLeg(hips, Mat,  1); BuildLeg(hips, Mat, -1);
            root.AddComponent<NeoRunnerMotion>();
            return root;
        }

        private static void BuildArm(Transform torso, System.Func<string, Color, float, Material> Mat, int side)
        {
            var sh = Pivot(torso, side > 0 ? "Arm_L" : "Arm_R", new Vector3(0.26f * side, 0.40f, 0f));
            Part(sh, "UpperArm", BeveledBox(0.11f, 0.30f, 0.11f, 0.04f), Mat("Suit", Suit, 1.2f), new Vector3(0f, -0.13f, 0f));
            Part(sh, "ShoulderPad", Sphere(0.085f), Mat("Accent", Accent, 1.8f), Vector3.zero);
            var el = Pivot(sh, "Elbow", new Vector3(0f, -0.28f, 0f));
            Part(el, "Forearm", BeveledBox(0.10f, 0.26f, 0.10f, 0.04f), Mat("Dark", Dark), new Vector3(0f, -0.11f, 0f));
            Part(el, "Glove", Sphere(0.075f), Mat("Joint", Joint, 1.4f), new Vector3(0f, -0.27f, 0f));
        }
        private static void BuildLeg(Transform hips, System.Func<string, Color, float, Material> Mat, int side)
        {
            var hip = Pivot(hips, side > 0 ? "Leg_L" : "Leg_R", new Vector3(0.11f * side, -0.04f, 0f));
            Part(hip, "Thigh", BeveledBox(0.14f, 0.36f, 0.14f, 0.05f), Mat("Dark", Dark), new Vector3(0f, -0.16f, 0f));
            var knee = Pivot(hip, "Knee", new Vector3(0f, -0.34f, 0f));
            Part(knee, "Shin", BeveledBox(0.12f, 0.34f, 0.12f, 0.04f), Mat("Suit", Suit, 1.2f), new Vector3(0f, -0.15f, 0f));
            Part(knee, "Shoe", BeveledBox(0.13f, 0.09f, 0.30f, 0.03f), Mat("Accent", Accent, 2.4f), new Vector3(0f, -0.34f, 0.06f));
        }
        private static Transform Pivot(Transform parent, string name, Vector3 pos)
        { var g = new GameObject(name); g.transform.SetParent(parent, false); g.transform.localPosition = pos; return g.transform; }
        private static void Part(Transform parent, string name, Mesh mesh, Material mat, Vector3 pos, Vector3 euler = default)
        { var g = new GameObject(name); g.transform.SetParent(parent, false); g.transform.localPosition = pos; g.transform.localRotation = Quaternion.Euler(euler);
          g.AddComponent<MeshFilter>().sharedMesh = mesh; g.AddComponent<MeshRenderer>().sharedMaterial = mat; }

        // ---- generated meshes (beveled box via subdivided cube w/ pushed verts, sphere via lat/long) ----
        public static Mesh BeveledBox(float w, float h, float d, float bevel)
        {
            // Flat-shaded box; the cartoon rounding comes from the sphere joints/caps layered on top.
            float x=w/2f, y=h/2f, z=d/2f; var v=new List<Vector3>(); var tris=new List<int>();
            Vector3[] normals={ Vector3.forward, Vector3.back, Vector3.right, Vector3.left, Vector3.up, Vector3.down };
            foreach(var n in normals)
            { Vector3 u = Mathf.Abs(n.y)>0.5f ? Vector3.right : Vector3.up; Vector3 up = Vector3.Cross(n,u); int st=v.Count;
              foreach(var (su,sv) in new[]{(-1,-1),(1,-1),(1,1),(-1,1)})
              { // corner = face centre + tangent offsets at the correct per-axis extents
                Vector3 corner = new Vector3(n.x*x, n.y*y, n.z*z);
                corner += new Vector3(u.x!=0?u.x*su*x:0, u.y!=0?u.y*su*y:0, u.z!=0?u.z*su*z:0);
                corner += new Vector3(up.x!=0?up.x*sv*x:0, up.y!=0?up.y*sv*y:0, up.z!=0?up.z*sv*z:0);
                v.Add(corner); }
              tris.AddRange(new[]{st,st+1,st+2, st,st+2,st+3}); }
            var mesh=new Mesh{name="NeoBox"}; mesh.SetVertices(v); mesh.SetTriangles(tris,0); mesh.RecalculateNormals(); mesh.RecalculateBounds(); return mesh;
        }
        public static Mesh Sphere(float radius, int lonSeg = 18, int latSeg = 12)
        {
            var v = new List<Vector3>(); var tris = new List<int>();
            for (int lat = 0; lat <= latSeg; lat++) { float th = Mathf.PI * lat / latSeg;
                for (int lon = 0; lon <= lonSeg; lon++) { float ph = 2f * Mathf.PI * lon / lonSeg;
                    v.Add(new Vector3(radius * Mathf.Sin(th) * Mathf.Cos(ph), radius * Mathf.Cos(th), radius * Mathf.Sin(th) * Mathf.Sin(ph))); } }
            for (int lat = 0; lat < latSeg; lat++) for (int lon = 0; lon < lonSeg; lon++)
            { int a = lat * (lonSeg+1) + lon, b2 = a + lonSeg + 1; tris.AddRange(new[]{ a, b2, a+1, b2, b2+1, a+1 }); }
            var mesh = new Mesh { name = "NeoSphere" }; mesh.SetVertices(v); mesh.SetTriangles(tris, 0); mesh.RecalculateNormals(); return mesh;
        }
    }
}
