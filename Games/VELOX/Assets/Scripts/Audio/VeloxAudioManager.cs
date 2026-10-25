using UnityEngine; using Velox.Catalogs;
namespace Velox.Audio
{
    public sealed class VeloxAudioManager : MonoBehaviour
    {
        [SerializeField] private AudioCatalog catalog;
        [SerializeField] private AudioSource music, sfx;
        private void Awake(){ if(!music) music=gameObject.AddComponent<AudioSource>(); if(!sfx) sfx=gameObject.AddComponent<AudioSource>(); music.loop=true; }
        public void PlayMenu(){ PlayMusic(catalog?catalog.menuMusic:null); }
        public void PlayGameplay(){ PlayMusic(catalog?catalog.gameplayMusic:null); }
        private void PlayMusic(AudioClip c){ if(!c){music.Stop();return;} music.clip=c; music.volume=catalog.musicVolume; music.Play(); }
        private void OneShot(AudioClip c){ if(c&&sfx) sfx.PlayOneShot(c,catalog?catalog.sfxVolume:1f); }
        public void Jump()=>OneShot(catalog?.jump); public void Slide()=>OneShot(catalog?.slide);
        public void Lane()=>OneShot(catalog?.laneSwitch); public void Coin()=>OneShot(catalog?.coin);
        public void Crash()=>OneShot(catalog?.crash); public void Click()=>OneShot(catalog?.click);
    }
}
