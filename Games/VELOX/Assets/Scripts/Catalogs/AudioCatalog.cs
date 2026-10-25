using UnityEngine;
namespace Velox.Catalogs
{
    /// <summary>All clips ship EMPTY. Drop in only CC0 / commercially-licensed audio you can document.</summary>
    [CreateAssetMenu(fileName="AudioCatalog", menuName="VELOX/Catalogs/Audio Catalog")]
    public sealed class AudioCatalog : ScriptableObject
    {
        [Header("Music (empty slots — licensed replacements only)")]
        public AudioClip menuMusic, gameplayMusic, gameOverStinger;
        [Header("SFX (empty slots)")]
        public AudioClip jump, slide, laneSwitch, coin, crash, click, countDown, newRecord;
        [Range(0,1)] public float musicVolume = .55f, sfxVolume = .9f;
        [Tooltip("Fill in per-clip source + licence (e.g. 'Composer X, CC0 1.0, url') before release.")]
        public string[] licenseAttributions;
    }
}
