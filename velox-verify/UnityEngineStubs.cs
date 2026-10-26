// ============================================================================
// VELOX offline verification stubs for the Unity Engine API surface used by
// the game. This file is NOT part of the Unity project. It exists only so the
// VELOX C# sources can be type-checked and unit-tested with a plain .NET
// compiler in environments where the Unity Editor is unavailable.
//
// It intentionally implements just enough of UnityEngine / UnityEngine.UI /
// UnityEngine.Events / UnityEngine.Networking to compile the game code and run
// its pure-logic tests. It is not a re-implementation of Unity.
// ============================================================================
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;

namespace UnityEngine
{
    // ---- Attributes ----
    public class HeaderAttribute : Attribute { public HeaderAttribute(string header) { } }
    public class TooltipAttribute : Attribute { public TooltipAttribute(string tooltip) { } }
    public class RangeAttribute : Attribute
    {
        public RangeAttribute(float min, float max) { }
        public RangeAttribute(int min, int max) { }
    }
    public class SerializeField : Attribute { }
    public class RequireComponentAttribute : Attribute { public RequireComponentAttribute(Type type) { } }
    public class CreateAssetMenuAttribute : Attribute
    {
        public string fileName;
        public string menuName;
        public int order;
    }
    public class ContextMenuAttribute : Attribute { public ContextMenuAttribute(string name) { } }

    // ---- Math / time / random / debug ----
    public static class Mathf
    {
        public static float Lerp(float a, float b, float t) => a + (b - a) * Math.Clamp(t, 0f, 1f);
        public static float Clamp(float v, float a, float b) => v < a ? a : (v > b ? b : v);
        public static int Clamp(int v, int a, int b) => v < a ? a : (v > b ? b : v);
        public static float Clamp01(float v) => v < 0f ? 0f : (v > 1f ? 1f : v);
        public static int CeilToInt(float f) => (int)Math.Ceiling(f);
        public static int RoundToInt(float f) => (int)Math.Round(f);
        public static int FloorToInt(float f) => (int)Math.Floor(f);
        public static float Abs(float f) => Math.Abs(f);
        public static int Abs(int i) => Math.Abs(i);
        public static float Sqrt(float f) => (float)Math.Sqrt(f);
        public static float Min(float a, float b) => Math.Min(a, b);
        public static float Max(float a, float b) => Math.Max(a, b);
        public static int Min(int a, int b) => Math.Min(a, b);
        public static int Max(int a, int b) => Math.Max(a, b);
    }

    public static class Time
    {
        public static float deltaTime => 0.016f;
        public static float time => 10f;
        public static float timeSinceLevelLoad => 10f;
    }

    public static class Debug
    {
        public static void Log(object message) { }
        public static void LogWarning(object message) { }
        public static void LogError(object message) { }
    }

    public static class Random
    {
        public static float value => 0.5f;
        public static int Range(int minInclusive, int maxExclusive) => minInclusive;
        public static float Range(float min, float max) => min;
    }

    public static class Application
    {
        public static string persistentDataPath =>
            Path.Combine(AppContext.BaseDirectory, "velox-data");
    }

    public static class PlayerPrefs
    {
        // In-memory backing so persistence logic (e.g. legacy-key migration) is
        // testable in the offline harness. Real Unity uses native PlayerPrefs.
        private static readonly Dictionary<string, string> _strings =
            new Dictionary<string, string>();

        public static int GetInt(string key, int defaultValue = 0)
        {
            return _strings.TryGetValue(key, out var s) && int.TryParse(s, out var i) ? i : defaultValue;
        }
        public static void SetInt(string key, int value) { _strings[key] = value.ToString(); }
        public static string GetString(string key, string defaultValue = "")
        {
            return _strings.TryGetValue(key, out var s) ? s : defaultValue;
        }
        public static void SetString(string key, string value) { _strings[key] = value; }
        public static void DeleteKey(string key) { _strings.Remove(key); }
        public static void Save() { }

        /// <summary>Test-only: clear all stored keys.</summary>
        public static void Clear() { _strings.Clear(); }
    }

    public static class Resources
    {
        public static T Load<T>(string path) where T : Object => null;
        public static Object Load(string path) => null;
    }

    public static class JsonUtility
    {
        public static string ToJson(object obj) => "";
        public static T FromJson<T>(string json) => default(T);
    }

    // ---- Vectors / quaternion / color ----
    public struct Vector2
    {
        public float x, y;
        public Vector2(float x, float y) { this.x = x; this.y = y; }
        public static Vector2 one => new Vector2(1f, 1f);
        public static Vector2 zero => new Vector2(0f, 0f);

        public static Vector2 operator -(Vector2 a, Vector2 b) => new Vector2(a.x - b.x, a.y - b.y);
        public static Vector2 operator +(Vector2 a, Vector2 b) => new Vector2(a.x + b.x, a.y + b.y);
        public static Vector2 operator *(Vector2 a, float d) => new Vector2(a.x * d, a.y * d);
        public static Vector2 operator /(Vector2 a, float d) => new Vector2(a.x / d, a.y / d);

        public float magnitude => Mathf.Sqrt(x * x + y * y);
        public float sqrMagnitude => x * x + y * y;
        public Vector2 normalized => magnitude < 1e-9f ? Vector2.zero : this / magnitude;
    }

    public struct Vector3
    {
        public float x, y, z;
        public Vector3(float x, float y, float z) { this.x = x; this.y = y; this.z = z; }
        public static Vector3 one => new Vector3(1f, 1f, 1f);
        public static Vector3 zero => new Vector3(0f, 0f, 0f);

        public static Vector3 operator -(Vector3 a, Vector3 b) => new Vector3(a.x - b.x, a.y - b.y, a.z - b.z);
        public static Vector3 operator +(Vector3 a, Vector3 b) => new Vector3(a.x + b.x, a.y + b.y, a.z + b.z);
        public static Vector3 operator *(Vector3 a, float d) => new Vector3(a.x * d, a.y * d, a.z * d);
        public static Vector3 operator /(Vector3 a, float d) => new Vector3(a.x / d, a.y / d, a.z / d);

        public float magnitude => Mathf.Sqrt(x * x + y * y + z * z);
        public float sqrMagnitude => x * x + y * y + z * z;
        public Vector3 normalized => magnitude < 1e-9f ? Vector3.zero : this / magnitude;
    }

    public struct Quaternion
    {
        public static Quaternion identity => new Quaternion();
        public static Quaternion Euler(float x, float y, float z) => new Quaternion();
        public static Quaternion Euler(Vector3 v) => new Quaternion();
        public static Quaternion LookRotation(Vector3 forward) => new Quaternion();
    }

    public struct Color
    {
        public float r, g, b, a;
        public Color(float r, float g, float b) { this.r = r; this.g = g; this.b = b; this.a = 1f; }
        public Color(float r, float g, float b, float a) { this.r = r; this.g = g; this.b = b; this.a = a; }
        public static Color white => new Color(1f, 1f, 1f, 1f);
        public static Color black => new Color(0f, 0f, 0f, 1f);
        public static Color clear => new Color(0f, 0f, 0f, 0f);
    }

    // ---- Object hierarchy ----
    public class Object
    {
        public string name { get; set; }

        public static void Destroy(Object obj) { }
        public static void DontDestroyOnLoad(Object obj) { }
        public static T FindObjectOfType<T>() where T : Object => null;

        public static Object Instantiate(Object original) => null;
        public static Object Instantiate(Object original, Transform parent) => null;
        public static T Instantiate<T>(T original) where T : Object => default(T);
        public static T Instantiate<T>(T original, Transform parent) where T : Object => default(T);
    }

    public class Component : Object
    {
        public GameObject gameObject { get; set; }
        public Transform transform { get; set; }

        public T GetComponent<T>() where T : class => null;
        public T GetComponentInChildren<T>() where T : class => null;
        public T GetComponentInChildren<T>(bool includeInactive) where T : class => null;
    }

    public class Behaviour : Component
    {
        public bool enabled { get; set; }
    }

    public class MonoBehaviour : Behaviour
    {
        public Coroutine StartCoroutine(IEnumerator routine) => null;
        public void StopCoroutine(Coroutine routine) { }
        public void StartCoroutine(string methodName) { }
    }

    public class Coroutine { }

    public class GameObject : Object
    {
        public GameObject() { transform = new Transform(); }
        public GameObject(string name) { this.name = name; transform = new Transform(); }
        public Transform transform { get; set; }
        public bool activeSelf { get; set; }
        public string tag { get; set; }

        public void SetActive(bool value) { }
        public T AddComponent<T>() where T : Component => null;
        public T GetComponent<T>() where T : class => null;
        public T GetComponentInChildren<T>() where T : class => null;
        public T GetComponentInChildren<T>(bool includeInactive) where T : class => null;
        public static GameObject CreatePrimitive(PrimitiveType type) => new GameObject();
    }

    public enum PrimitiveType { Cube, Sphere, Capsule, Cylinder, Plane, Quad }

    public class Transform : Component
    {
        public Vector3 position { get; set; }
        public Vector3 localPosition { get; set; }
        public Quaternion rotation { get; set; }
        public Vector3 localScale { get; set; }
        public void LookAt(Transform target) { }
        public void LookAt(Vector3 point) { }
        public void SetParent(Transform parent) { }
    }

    public class ScriptableObject : Object
    {
        public static T CreateInstance<T>() where T : ScriptableObject => null;
    }

    public class Camera : Behaviour
    {
        public static Camera main { get; set; }
        public float fieldOfView { get; set; }
        public float nearClipPlane { get; set; }
        public float farClipPlane { get; set; }
    }

    public enum RenderMode { ScreenSpaceOverlay, ScreenSpaceCamera, WorldSpace }
    public enum TextAnchor { UpperLeft, UpperCenter, UpperRight, MiddleLeft, MiddleCenter, MiddleRight, LowerLeft, LowerCenter, LowerRight }
    public enum TextureFormat { RGBA32, ARGB32, RGB24 }
    public enum LightType { Directional, Point, Spot, Area }
    public enum LightShadows { None, Soft, Hard }

    public class RectOffset
    {
        public int left, right, top, bottom;
        public RectOffset() { }
        public RectOffset(int l, int r, int t, int b) { left = l; right = r; top = t; bottom = b; }
    }

    public class Sprite : Object
    {
        public static Sprite Create(Texture2D tex, Rect pixelRect, Vector2 pivot) => new Sprite();
        public static Sprite Create(Texture2D tex, Rect pixelRect) => new Sprite();
    }

    public class Light : Behaviour
    {
        public LightType type { get; set; }
        public LightShadows shadows { get; set; }
    }

    public static class RenderSettings
    {
        public static Color ambientLight { get; set; }
        public static bool fog { get; set; }
    }

    public class RectTransform : Transform
    {
        public Vector2 anchorMin { get; set; }
        public Vector2 anchorMax { get; set; }
        public Vector2 pivot { get; set; }
        public Vector2 anchoredPosition { get; set; }
        public Vector2 sizeDelta { get; set; }
    }

    public class Renderer : Behaviour
    {
        public Material material { get; set; }
    }

    public class Material : Object
    {
        public Material() { }
        public Material(Shader shader) { }
        public Texture2D mainTexture { get; set; }
        public Vector2 mainTextureScale { get; set; }
        public Color color { get; set; }
    }

    public class MeshRenderer : Renderer { }

    public class Shader
    {
        public static Shader Find(string name) => null;
    }

    public class Texture { }

    public struct Rect
    {
        public float x, y, width, height;
        public Rect(float x, float y, float width, float height)
        {
            this.x = x; this.y = y; this.width = width; this.height = height;
        }
    }

    public class Texture2D : Texture
    {
        public Texture2D(int width, int height, TextureFormat format, bool msaa) { }
        public void SetPixel(int x, int y, Color c) { }
        public void Apply() { }
    }
    public class AudioClip : Object { }

    public class Animator : Behaviour
    {
        public bool HasParameter(string name) => false;
        public void SetFloat(string name, float value) { }
        public void SetBool(string name, bool value) { }
    }

    public class Collider : Behaviour
    {
        public bool isTrigger { get; set; }
        public bool CompareTag(string tag) => false;
    }

    public class BoxCollider : Collider { public Vector3 size { get; set; } public Vector3 center { get; set; } }
    public class SphereCollider : Collider { public float radius { get; set; } }
    public class CapsuleCollider : Collider { public float radius { get; set; } public float height { get; set; } public Vector3 center { get; set; } }

    public class Rigidbody : Behaviour
    {
        public bool isKinematic { get; set; }
        public bool useGravity { get; set; }
        public RigidbodyConstraints constraints { get; set; }
    }

    [Flags]
    public enum RigidbodyConstraints
    {
        None = 0,
        FreezePositionX = 1,
        FreezePositionY = 2,
        FreezePositionZ = 4,
        FreezeRotationX = 8,
        FreezeRotationY = 16,
        FreezeRotationZ = 32,
        FreezeRotation = FreezeRotationX | FreezeRotationY | FreezeRotationZ
    }

    public static class Input
    {
        public static float GetAxisRaw(string axis) => 0f;
        public static float GetAxis(string axis) => 0f;
        public static bool GetKeyDown(KeyCode key) => false;
        public static bool GetKey(KeyCode key) => false;
        public static bool GetButtonDown(string button) => false;
        public static bool GetButton(string button) => false;
        public static int touchCount => 0;
        public static Touch GetTouch(int index) => default(Touch);
    }

    [Flags]
    public enum KeyCode { None = 0, UpArrow, DownArrow, LeftArrow, RightArrow, W, A, S, D, Escape, P }

    public struct Touch
    {
        public Vector2 position;
        public TouchPhase phase;
    }

    public enum TouchPhase { Began, Moved, Ended, Stationary, Canceled }
}

namespace UnityEngine.Events
{
    public delegate void UnityAction();
    public delegate void UnityAction<T0>(T0 arg0);

    public class UnityEvent
    {
        public void Invoke() { }
        public void AddListener(UnityAction call) { }
        public void RemoveListener(UnityAction call) { }
    }

    public class UnityEvent<T0>
    {
        public void Invoke(T0 arg0) { }
        public void AddListener(UnityAction<T0> call) { }
        public void RemoveListener(UnityAction<T0> call) { }
    }
}

namespace UnityEngine.UI
{
    public class ClickEvent
    {
        public void AddListener(UnityEngine.Events.UnityAction call) { }
    }

    public class Text : UnityEngine.Behaviour
    {
        public string text { get; set; }
    }

    public class Button : UnityEngine.Behaviour
    {
        public ClickEvent onClick { get; set; }
    }

    public class Image : UnityEngine.Behaviour
    {
        public UnityEngine.Sprite sprite { get; set; }
        public UnityEngine.Color color { get; set; }
        public bool raycastTarget { get; set; }
    }

    public class RawImage : UnityEngine.Behaviour
    {
        public UnityEngine.Texture2D texture { get; set; }
        public bool preserveAspect { get; set; }
        public UnityEngine.Color color { get; set; }
        public RectTransform rectTransform { get; set; }
    }

    public class Canvas : UnityEngine.Behaviour
    {
        public UnityEngine.RenderMode renderMode { get; set; }
        public UnityEngine.Camera worldCamera { get; set; }
    }

    public class CanvasScaler : UnityEngine.Behaviour
    {
        public enum ScaleMode { ConstantPixelSize, ScaleWithScreenSize, ScaleToFit }
        public ScaleMode uiScaleMode { get; set; }
        public UnityEngine.Vector2 referenceResolution { get; set; }
    }

    public class GraphicRaycaster : UnityEngine.Behaviour { }

    public class VerticalLayoutGroup : UnityEngine.Behaviour
    {
        public UnityEngine.RectOffset padding { get; set; }
        public float spacing { get; set; }
        public UnityEngine.TextAnchor childAlignment { get; set; }
        public bool controlChildSize { get; set; }
    }

    public class HorizontalLayoutGroup : UnityEngine.Behaviour
    {
        public UnityEngine.RectOffset padding { get; set; }
        public float spacing { get; set; }
        public UnityEngine.TextAnchor childAlignment { get; set; }
        public bool controlChildSize { get; set; }
    }

    public class ContentSizeFitter : UnityEngine.Behaviour
    {
        public enum FitMode { None, MinSize, PreferredSize }
        public FitMode verticalFit { get; set; }
        public FitMode horizontalFit { get; set; }
    }

    // Mirrors UnityEngine.UI.LayoutElement. ignoreLayout=true opts a child out
    // of its parent LayoutGroup so it keeps its own stretch-to-parent size
    // (e.g. a full-row background highlight) instead of being positioned by the
    // layout group.
    public class LayoutElement : UnityEngine.Behaviour
    {
        public bool ignoreLayout { get; set; }
        public bool flexibleWidth { get; set; }
        public bool flexibleHeight { get; set; }
    }
}

namespace UnityEngine.Networking
{
    public enum UnityWebRequestResult { Success, Failure, ConnectionError, ProtocolError, DataProcessingError }

    public class UnityWebRequestAsyncOperation
    {
        public bool isDone => true;
    }

    public class DownloadHandler
    {
        public string text => "";
    }

    public class UnityWebRequest : IDisposable
    {
        public enum Result { Success, Failure, ConnectionError, ProtocolError, DataProcessingError }

        public static UnityWebRequest Get(string uri) => new UnityWebRequest();
        public static UnityWebRequest Post(string uri, string contentType, string body) => new UnityWebRequest();
        public static UnityWebRequest Post(string uri, string contentType, byte[] body) => new UnityWebRequest();
        public static UnityWebRequest Put(string uri, string body) => new UnityWebRequest();
        public static UnityWebRequest Put(string uri, byte[] body) => new UnityWebRequest();

        public void SetRequestHeader(string name, string value) { }

        public UnityWebRequestAsyncOperation SendWebRequest() => new UnityWebRequestAsyncOperation();
        public Result result => Result.Success;
        public string error => "";
        public DownloadHandler downloadHandler => new DownloadHandler();
        public void Dispose() { }
    }
}

namespace TMPro
{
    // Minimal stub of TextMeshPro's abstract text base. The Unity project uses
    // TMPro.TextMeshProUGUI for all UI text so it renders with the package's
    // bundled default font without any assigned font asset.
    public class TMP_Text : UnityEngine.Behaviour
    {
        public string text { get; set; }
        public float fontSize { get; set; }
        public UnityEngine.Color color { get; set; }
        public TextAlignmentOptions alignment { get; set; }
        public UnityEngine.RectTransform rectTransform { get; set; }
    }

    public enum TextAlignmentOptions { Left, Center, Right, Justified }

    public class TextMeshProUGUI : TMP_Text { }
}

namespace UnityEngine.SceneManagement
{
    public struct Scene
    {
        public string name;
        public bool isValid { get; set; }
    }
}

namespace UnityEditor
{
    public class MenuItem : Attribute
    {
        public MenuItem(string item) { }
    }

    public static class EditorUtility
    {
        public static bool DisplayDialog(string title, string message, string ok) { return true; }
    }

    public static class EditorBuildSettings
    {
        public static UnityEditor.EditorBuildSettings.Scene[] scenes { get; set; }

        public struct Scene
        {
            public string path;
            public bool enabled;
            public Scene(string path, bool enabled) { this.path = path; this.enabled = enabled; }
        }
    }

    public static class AssetDatabase
    {
        public static T LoadAssetAtPath<T>(string path) where T : UnityEngine.Object => null;
        public static bool IsValidFolder(string path) { return false; }
        public static string CreateFolder(string parent, string name) { return name; }
        public static void CreateAsset(UnityEngine.Object asset, string path) { }
        public static void SaveAssets() { }
        public static void Refresh() { }
    }
}

namespace UnityEditor.SceneManagement
{
    public enum NewSceneSetup { EmptyScene, DefaultScene }
    public enum NewSceneMode { Single, Additive }

    public static class EditorSceneManager
    {
        public static UnityEngine.SceneManagement.Scene NewScene(NewSceneSetup setup, NewSceneMode mode)
            => default(UnityEngine.SceneManagement.Scene);

        public static bool SaveScene(UnityEngine.SceneManagement.Scene scene, string path) { return true; }
    }
}
