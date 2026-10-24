using System;
using System.Runtime.InteropServices;
using UnityEngine;

namespace UltimateFootballChase.Settings
{
    /// <summary>Distinct game-music and effect channels; never set AudioListener.volume or request exclusive focus.</summary>
    public sealed class GameAudio : MonoBehaviour
    {
        public static GameAudio Instance { get; private set; }
        private AudioSource music, effects;
        private AudioClip coinClip, jumpClip, impactClip;
        private bool hapticsEnabled;
#if UNITY_IOS && !UNITY_EDITOR
        [DllImport("__Internal")] private static extern void UFC_UseAmbientAudioSession();
#endif
        public static GameAudio Ensure() => Instance != null ? Instance :
            new GameObject("Original game audio — separate music and SFX").AddComponent<GameAudio>();
        private void Awake()
        {
            if (Instance != null && Instance != this) { Destroy(gameObject); return; }
            Instance = this;
            DontDestroyOnLoad(gameObject);
            music = gameObject.AddComponent<AudioSource>(); music.playOnAwake = false; music.loop = true;
            music.volume = 0f;
            music.clip = OriginalPrototypeLoop();
            music.Play();
            effects = gameObject.AddComponent<AudioSource>(); effects.playOnAwake = false;
            coinClip = Tone("Original coin ping", 820f, .065f);
            jumpClip = Tone("Original jump", 470f, .075f);
            impactClip = Tone("Original impact", 180f, .105f);
#if UNITY_IOS && !UNITY_EDITOR
            UFC_UseAmbientAudioSession(); // native Ambient category mixes with external phone music
#endif
        }
        private void OnDestroy() { if (Instance == this) Instance = null; }
        public void Apply(HubOptions options)
        {
            if (options == null) return;
            options.Normalize();
            music.volume = options.UseMyMusic ? 0f : options.MusicVolume;
            effects.volume = options.SfxVolume; // never muted by Use My Music
            hapticsEnabled = options.HapticsEnabled;
#if UNITY_IOS && !UNITY_EDITOR
            if (options.UseMyMusic) UFC_UseAmbientAudioSession();
#endif
        }
        public void Coin() { if (effects != null) effects.PlayOneShot(coinClip); }
        public void Jump() { if (effects != null) effects.PlayOneShot(jumpClip); }
        public void Impact()
        {
            if (effects != null) effects.PlayOneShot(impactClip);
            if (hapticsEnabled && (Application.platform == RuntimePlatform.Android ||
                                   Application.platform == RuntimePlatform.IPhonePlayer)) Handheld.Vibrate();
        }
        private static AudioClip OriginalPrototypeLoop()
        {
            // Short original procedural pulse (provisional soundtrack, not a commercial music recording).
            const int rate = 22050;
            const float duration = 4f;
            const int beatCount = 8;
            float[] notes = { 329.63f, 392f, 440f, 392f, 329.63f, 493.88f, 440f, 392f };
            var data = new float[rate * (int)duration];
            for (int i = 0; i < data.Length; i++)
            {
                float t = i / (float)rate;
                int beat = Mathf.Min(beatCount - 1, Mathf.FloorToInt(t * 2f));
                float phase = t * 2f - beat;
                float envelope = Mathf.Pow(1f - phase, 2f);
                float bass = Mathf.Sin(2f * Mathf.PI * (beat % 4 == 0 ? 82.41f : 110f) * t) *
                    Mathf.Pow(1f - (t * 4f % 1f), 4f);
                data[i] = .12f * Mathf.Sin(2f * Mathf.PI * notes[beat] * t) * envelope + .07f * bass;
            }
            AudioClip loop = AudioClip.Create("Original four-second prototype pulse", data.Length, 1, rate, false);
            loop.SetData(data, 0);
            return loop;
        }
        private static AudioClip Tone(string name, float hz, float seconds)
        {
            const int sampleRate = 22050;
            int count = Mathf.CeilToInt(seconds * sampleRate);
            var data = new float[count];
            for (int i = 0; i < count; i++)
            {
                float t = i / (float)sampleRate;
                data[i] = .16f * Mathf.Sin(2f * Mathf.PI * hz * t) * (1f - i / (float)count);
            }
            AudioClip clip = AudioClip.Create(name, count, 1, sampleRate, false);
            clip.SetData(data, 0);
            return clip;
        }
    }
}
