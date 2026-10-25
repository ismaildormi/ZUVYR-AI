using System.Collections.Generic; using UnityEngine;
namespace Velox.Ads
{
    /// <summary>Pools CustomBillboardAd instances on both road sides; TrackGenerator calls PopulateSegment per recycled segment.</summary>
    public sealed class BillboardSpawner : MonoBehaviour
    {
        [SerializeField] private CustomBillboardAd billboardPrefab;
        [SerializeField] private float sideOffset = 6.5f, height = 3.2f;
        [SerializeField, Range(0,3)] private int perSegment = 2;
        [SerializeField] private float despawnBehindPlayer = 35f;
        [SerializeField] private Transform player;
        private readonly List<CustomBillboardAd> active = new(); private readonly Stack<CustomBillboardAd> pool = new();
        public void PopulateSegment(float segmentStartZ, float segmentLength)
        {
            if(!billboardPrefab || perSegment==0) return;
            for(int i=0;i<perSegment;i++)
            {
                bool left = (i%2==0); float x = left? -sideOffset : sideOffset;
                float z = segmentStartZ + segmentLength*(0.3f+0.4f*i/Mathf.Max(1,perSegment));
                var b = pool.Count>0 ? pool.Pop() : Instantiate(billboardPrefab, transform);
                b.OnSpawned(new Vector3(x,height,z), Quaternion.Euler(0, left?90f:-90f,0)); active.Add(b);
            }
        }
        private void Update()
        { if(!player) return; for(int i=active.Count-1;i>=0;i--) if(active[i].transform.position.z < player.position.z-despawnBehindPlayer){ active[i].Despawn(); pool.Push(active[i]); active.RemoveAt(i); } }
    }
}
