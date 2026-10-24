using UnityEngine;

namespace UltimateFootballChase.Gameplay
{
    /// <summary>Original, unbranded procedural primitives. Replace visuals later without changing gameplay.</summary>
    public static class GreyboxFactory
    {
        public static Material Material(Color color)
        {
            Shader shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            var material = new Material(shader) { color = color };
            return material;
        }
        public static Transform Primitive(string name, PrimitiveType type, Transform parent, Vector3 localPosition,
            Vector3 scale, Color color)
        {
            GameObject go = GameObject.CreatePrimitive(type);
            go.name = name;
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPosition;
            go.transform.localScale = scale;
            var collider = go.GetComponent<Collider>();
            if (collider != null)
            {
                // Editor tests construct the same greybox outside Play mode; Destroy is illegal there.
#if UNITY_EDITOR
                if (!Application.isPlaying) Object.DestroyImmediate(collider);
                else Object.Destroy(collider);
#else
                Object.Destroy(collider);
#endif
            } // arcade swept hit-testing, not physics callbacks
            go.GetComponent<Renderer>().sharedMaterial = Material(color);
            return go.transform;
        }
    }
}
