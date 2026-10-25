using UnityEngine;
namespace Velox.World
{
    public enum AvoidAction { Jump, Slide, DodgeLane }
    [CreateAssetMenu(fileName="Obstacle", menuName="VELOX/World/Obstacle Definition")]
    public sealed class ObstacleDefinition : ScriptableObject
    {
        public GameObject prefab;                 // concrete barrier / parked car / road block / overhead sign
        public AvoidAction avoidBy = AvoidAction.Jump;
        [Range(0,1)] public float spawnWeight = 1f;
        public int minLaneSpan = 1, maxLaneSpan = 2; // never block all 3 lanes: a survivable path always exists
    }
}
