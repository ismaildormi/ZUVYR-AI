using System;
using UnityEngine;

namespace UltimateFootballChase.Settings
{
    public enum SettingAction { ToggleMyMusic, MusicDown, MusicUp, SfxDown, SfxUp, ToggleHaptics, NextLanguage, NextRegion }

    [Serializable]
    public sealed class HubOptions
    {
        public float MusicVolume = .65f;
        public float SfxVolume = .8f;
        public bool UseMyMusic;
        public bool HapticsEnabled = true;
        public string Language = "en";
        public string Region = "MA"; // PDF default; not GPS, identity or prize eligibility

        public void Normalize()
        {
            MusicVolume = float.IsNaN(MusicVolume) || float.IsInfinity(MusicVolume) ? .65f : Mathf.Clamp01(MusicVolume);
            SfxVolume = float.IsNaN(SfxVolume) || float.IsInfinity(SfxVolume) ? .8f : Mathf.Clamp01(SfxVolume);
            if (Language != "ar" && Language != "fr" && Language != "en") Language = "en";
            if (Region != "MA" && Region != "OTHER") Region = "MA";
        }
        public void Change(SettingAction action)
        {
            switch (action)
            {
                case SettingAction.ToggleMyMusic: UseMyMusic = !UseMyMusic; break;
                case SettingAction.MusicDown: MusicVolume = Mathf.Max(0, MusicVolume - .1f); break;
                case SettingAction.MusicUp: MusicVolume = Mathf.Min(1, MusicVolume + .1f); break;
                case SettingAction.SfxDown: SfxVolume = Mathf.Max(0, SfxVolume - .1f); break;
                case SettingAction.SfxUp: SfxVolume = Mathf.Min(1, SfxVolume + .1f); break;
                case SettingAction.ToggleHaptics: HapticsEnabled = !HapticsEnabled; break;
                case SettingAction.NextLanguage:
                    Language = Language == "ar" ? "fr" : Language == "fr" ? "en" : "ar"; break;
                case SettingAction.NextRegion: Region = Region == "MA" ? "OTHER" : "MA"; break;
                default: throw new ArgumentOutOfRangeException(nameof(action));
            }
            Normalize();
        }
    }
}
