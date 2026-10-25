using System.Collections.Generic; using UnityEngine; using Velox.Catalogs; using Velox.Ads;
namespace Velox.World
{
    /// <summary>Endless city track: pooled segments recycled ahead of NEO. Billboards are spawned
    /// alongside (never in lanes) through the same recycle loop — zero per-frame allocation.</summary>
    public sealed class TrackGenerator : MonoBehaviour
    {
        [SerializeField] private VisualCatalog catalog;
        [SerializeField] private Transform player;
        [SerializeField] private float segmentLength = 30f;
        [SerializeField] private int visibleSegments = 7;
        [SerializeField] private ObstacleDefinition[] obstacles;
        [SerializeField] private BillboardSpawner billboards;
        [SerializeField] private int coinEverySegments = 2;
        private readonly Queue<GameObject> pool = new();
        private float nextZ; private int spawned;
        private void Start(){ if(!player){ var pc=FindObjectOfType<Velox.Player.PlayerController>(); if(pc) player=pc.transform; } for(int i=0;i<visibleSegments;i++) SpawnSegment(true); }
        private void Update(){ if(!player) return; while(nextZ - player.position.z < segmentLength*visibleSegments) { RecycleBehind(); SpawnSegment(false); } }
        private void RecycleBehind(){ foreach(Transform s in transform) if(s.position.z + segmentLength < player.position.z - segmentLength) { s.gameObject.SetActive(false); if(!pool.Contains(s.gameObject)) pool.Enqueue(s.gameObject); } }
        private void SpawnSegment(bool initial)
        {
            GameObject seg = pool.Count>0 ? pool.Dequeue() : Instantiate(Pick(catalog.roadSegmentPrefabs), transform);
            seg.transform.position = new Vector3(0,0,nextZ); seg.SetActive(true);
            // obstacles (skip first 2 segments so the player can settle in)
            if(!initial && spawned>1 && obstacles!=null && obstacles.Length>0)
            {
                var def = PickWeighted(obstacles);
                if(def && def.prefab)
                {
                    int lanes = Random.Range(def.minLaneSpan, Mathf.Min(def.maxLaneSpan,2)+1); // <=2 of 3 lanes
                    int firstLane = Random.Range(0, 3-lanes+1);
                    for(int l=firstLane;l<firstLane+lanes;l++)
                        Place(def.prefab, l, nextZ + Random.Range(8f, segmentLength-4f));
                }
                if(catalog.coinPrefab && spawned%Mathf.Max(1,coinEverySegments)==0)
                { int lane=Random.Range(0,3); for(int i=0;i<5;i++) Place(catalog.coinPrefab,lane,nextZ+6f+i*2f,1.1f); }
            }
            billboards?.PopulateSegment(nextZ, segmentLength);
            nextZ += segmentLength; spawned++;
        }
        private void Place(GameObject prefab,int lane,float z,float y=0f)
        { var o=Instantiate(prefab,transform); o.transform.position=new Vector3((lane-1)*2.2f,y,z); }
        private static GameObject Pick(GameObject[] a)=> a==null||a.Length==0?null:a[Random.Range(0,a.Length)];
        private static ObstacleDefinition PickWeighted(ObstacleDefinition[] a)
        { float t=0; foreach(var d in a) t+=d.spawnWeight; float r=Random.value*t;
          foreach(var d in a){ r-=d.spawnWeight; if(r<=0) return d; } return a[a.Length-1]; }
    }
}
