using UnityEngine;

namespace UltimateFootballChase.PowerUps
{
    public enum PowerKind { Magnet, SuperShoes, Jetpack, Hoverboard }

    /// <summary>Offline run state only; no store, ad, cloud inventory or trusted backend balance.</summary>
    public sealed class PowerUpState
    {
        private readonly PowerUpConfig config;
        private readonly float[] remaining = new float[4];
        public int BoardCharges { get; private set; }
        public bool IsProtected => Active(PowerKind.Jetpack) || Active(PowerKind.Hoverboard);
        public bool Flying => Active(PowerKind.Jetpack);

        public PowerUpState(PowerUpConfig settings) { config = settings; Reset(); }
        public float Remaining(PowerKind kind) => remaining[(int)kind];
        public bool Active(PowerKind kind) => Remaining(kind) > 0f;
        public float Duration(PowerKind kind)
        {
            switch (kind)
            {
                case PowerKind.Magnet: return config.MagnetSeconds;
                case PowerKind.SuperShoes: return config.SuperShoesSeconds;
                case PowerKind.Jetpack: return config.JetpackSeconds;
                default: return PowerUpConfig.HoverboardProtectionSeconds;
            }
        }
        public void Reset()
        {
            for (int i = 0; i < remaining.Length; i++) remaining[i] = 0f;
            BoardCharges = config.TestOnlyStartingBoards;
        }
        public void Collect(PowerKind kind)
        {
            if (kind == PowerKind.Hoverboard) { BoardCharges++; return; }
            // Multiple pickups refresh duration without erasing already-longer active time.
            remaining[(int)kind] = Mathf.Max(remaining[(int)kind], Duration(kind));
        }
        public bool TryActivateBoard()
        {
            if (BoardCharges <= 0 || Active(PowerKind.Hoverboard)) return false;
            BoardCharges--;
            remaining[(int)PowerKind.Hoverboard] = PowerUpConfig.HoverboardProtectionSeconds;
            return true;
        }
        public void Tick(float dt)
        {
            for (int i = 0; i < remaining.Length; i++)
            {
                float next = remaining[i] - Mathf.Max(0f, dt);
                remaining[i] = next <= .0001f ? 0f : next; // float-rounding-safe expiry
            }
        }
    }
}
