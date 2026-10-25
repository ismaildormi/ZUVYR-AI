using UnityEngine;
namespace Velox.Ads
{
    public enum BillboardAnimation { Static, TextureCycle, CrossfadePulse, SlideTextureOffset }
    /// <summary>
    /// VELOX in-world animated billboard. Workflow: select the billboard in the scene/prefab, then drag
    /// YOUR OWN (or sponsor-licensed) images into 'Texture Slots' in the Inspector — no ad SDK, no network
    /// calls, no tracking. Rendering uses one shared material + MaterialPropertyBlock, so 100 billboards
    /// cost one material and zero allocations after Awake.
    /// </summary>
    [RequireComponent(typeof(Renderer))]
    public sealed class CustomBillboardAd : MonoBehaviour
    {
        [Header("Texture Slots — drag your own ad creatives here")]
        [SerializeField] private Texture2D[] textureSlots;
        [Header("Animation")]
        [SerializeField] private BillboardAnimation animationMode = BillboardAnimation.TextureCycle;
        [SerializeField, Min(0.5f)] private float displaySecondsPerTexture = 4f;
        [SerializeField, Min(0.05f)] private float fadeSeconds = 0.6f;
        [SerializeField] private Vector2 slideSpeed = new Vector2(0.05f, 0f);
        [SerializeField] private bool faceRoad = true;            // yaw toward the runner's lane line
        [Header("Performance")]
        [SerializeField] private bool pauseWhenOffscreen = true;  // OnBecameVisible/Invisible gate
        private Renderer rend; private MaterialPropertyBlock mpb; private int index; private float timer; private bool visibleNow = true;
        private static readonly int MainTex = Shader.PropertyToID("_MainTex");
        private static readonly int BaseMap = Shader.PropertyToID("_BaseMap");
        private static readonly int BaseColor = Shader.PropertyToID("_BaseColor");
        private static readonly int MainTexST = Shader.PropertyToID("_MainTex_ST");
        private void Awake(){ rend=GetComponent<Renderer>(); mpb=new MaterialPropertyBlock(); ApplyTexture(0,1f); if(faceRoad) transform.rotation=Quaternion.LookRotation(transform.position.z>0?Vector3.back:Vector3.forward, Vector3.up); }
        private void OnBecameVisible()=> visibleNow=true;
        private void OnBecameInvisible()=> visibleNow=false;
        private void Update()
        {
            if(pauseWhenOffscreen && !visibleNow) return;
            if(textureSlots==null || textureSlots.Length==0) return;
            switch(animationMode)
            {
                case BillboardAnimation.TextureCycle:
                    timer+=Time.deltaTime; if(timer>=displaySecondsPerTexture){ timer=0; index=(index+1)%textureSlots.Length; ApplyTexture(index,1f); } break;
                case BillboardAnimation.CrossfadePulse: // fade to black-point, swap texture, fade back (shader-agnostic)
                    timer+=Time.deltaTime; float cycle=displaySecondsPerTexture+fadeSeconds*2; float t=timer%cycle;
                    float a = t<fadeSeconds ? 1f-t/fadeSeconds : t>displaySecondsPerTexture+fadeSeconds ? (t-displaySecondsPerTexture-fadeSeconds)/fadeSeconds : 1f;
                    int want = Mathf.FloorToInt(timer/cycle)%textureSlots.Length;
                    if(want!=index){ if(a<=0.01f){ index=want; ApplyTexture(index,0f); break; } }
                    ApplyTexture(index, Mathf.Clamp01(a)); break;
                case BillboardAnimation.SlideTextureOffset:
                    rend.GetPropertyBlock(mpb); mpb.SetVector(MainTexST, new Vector4(1,1, Time.time*slideSpeed.x % 1f, Time.time*slideSpeed.y % 1f)); rend.SetPropertyBlock(mpb); break;
            }
        }
        private void ApplyTexture(int i, float brightness)
        { if(textureSlots.Length==0) return; var tex=textureSlots[Mathf.Clamp(i,0,textureSlots.Length-1)]; if(!tex) return;
          rend.GetPropertyBlock(mpb); mpb.SetTexture(MainTex,tex); mpb.SetTexture(BaseMap,tex); mpb.SetColor(BaseColor, new Color(brightness,brightness,brightness,1f)); rend.SetPropertyBlock(mpb); }
        /// <summary>Called by BillboardSpawner when this pooled billboard is recycled into a new segment.</summary>
        public void OnSpawned(Vector3 pos, Quaternion rot){ transform.SetPositionAndRotation(pos,rot); timer=Random.value*displaySecondsPerTexture; gameObject.SetActive(true); }
        public void Despawn()=> gameObject.SetActive(false);
    }
}
