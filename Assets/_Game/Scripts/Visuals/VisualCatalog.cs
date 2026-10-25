using UnityEngine;

namespace VELOX.Visuals
{
    /// <summary>
    /// Central catalog of every visual asset the runner needs. Edit this asset
    /// to re-skin the game (change the character, the environment theme, the
    /// obstacles, and the in-game ad frames) without touching gameplay code.
    /// </summary>
    /// <remarks>
    /// Default environment theme is <c>railway</c> (tracks + stations). The
    /// character prefab should be the cartoon human <c>NEO</c>.
    /// </remarks>
    [CreateAssetMenu(fileName = "VisualCatalog", menuName = "VELOX/Visual Catalog", order = 0)]
    public class VisualCatalog : ScriptableObject
    {
        [Header("Character")]
        [Tooltip("Cartoon human runner 'NEO'.")]
        public GameObject PlayerPrefab;
        public string CharacterName = "NEO";

        [Header("Environment theme")]
        [Tooltip("railway | station | futuristic — drives decoration choice.")]
        public string EnvironmentTheme = "railway";
        public GameObject TrackSegmentPrefab;
        public GameObject DecorationPrefab;

        [Header("Gameplay objects")]
        public GameObject ObstaclePrefab;
        public GameObject CoinPrefab;

        [Header("In-game advertising")]
        [Tooltip("Billboard panel that renders the ad frames / static texture.")]
        public GameObject BillboardPrefab;
        public Texture2D[] BillboardAdFrames;
        public Texture2D BillboardStaticTexture;
        [Range(0.5f, 6f)] public float BillboardScale = 1.6f;

        [Header("Audio (optional)")]
        public AudioClip JumpSound;
        public AudioClip SlideSound;
        public AudioClip CoinSound;
        public AudioClip DeathSound;
    }
}
