using UnityEngine;
using VELOX.Core;

namespace VELOX.Gameplay
{
    /// <summary>A physical obstacle in the runner's path.</summary>
    public class Obstacle : MonoBehaviour
    {
        public enum Kind
        {
            Jumpable,  // must jump
            Slideable, // must slide
            Block      // must change lane
        }

        [SerializeField] private Kind _kind = Kind.Jumpable;
        [SerializeField] private bool _ignoreCollision;

        public Kind ConfiguredKind => _kind;
        public bool IgnoreCollision => _ignoreCollision;

        /// <summary>Called by the track generator when recycling an obstacle.</summary>
        public void Configure(Kind kind)
        {
            _kind = kind;
            _ignoreCollision = false;
            gameObject.SetActive(true);
        }

        public void Recycle() => gameObject.SetActive(false);
    }

    /// <summary>A collectible pickup (coin / power-up) that rewards the runner.</summary>
    public class Collectible : MonoBehaviour
    {
        [SerializeField] private int _value = 1;
        [SerializeField] private bool _spin = true;

        public int Value => _value;

        private float _spinBase;
        private bool _collected;

        void Start()
        {
            _spinBase = Time.time;
        }

        void Update()
        {
            if (_spin && !_collected && gameObject.activeSelf)
                transform.rotation = Quaternion.Euler(0f, Time.time * 90f - _spinBase * 90f, 0f);
        }

        /// <summary>Called by the <see cref="RunnerMotor"/> when the runner touches it.</summary>
        public void Collect()
        {
            if (_collected) return;
            _collected = true;
            gameObject.SetActive(false);

            // Counted by the GameDirector via a lightweight event.
            ServiceLocator.GameDirector?.AddCoins(_value);
        }
    }
}
