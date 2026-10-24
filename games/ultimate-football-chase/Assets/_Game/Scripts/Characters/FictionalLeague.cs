using UnityEngine;

namespace UltimateFootballChase.Characters
{
    public sealed class FictionalTeam
    {
        public readonly string Name;
        public readonly Color Primary, Accent;
        public FictionalTeam(string name, Color primary, Color accent)
        { Name = name; Primary = primary; Accent = accent; }
    }
    /// <summary>Independent, original concept names and colour pairings; not football club replicas.</summary>
    public static class FictionalLeague
    {
        public const string Name = "World Legends League";
        public static readonly FictionalTeam[] Teams = {
            new FictionalTeam("Copper Meteors", new Color(.86f,.42f,.20f), new Color(.16f,.23f,.32f)),
            new FictionalTeam("Orchid Rovers", new Color(.68f,.31f,.68f), new Color(.27f,.79f,.72f)),
            new FictionalTeam("Harbor Gliders", new Color(.19f,.54f,.72f), new Color(.92f,.76f,.31f)),
            new FictionalTeam("Quartz Lanterns", new Color(.66f,.70f,.72f), new Color(.47f,.30f,.63f)),
            new FictionalTeam("Cinder Owls", new Color(.32f,.34f,.39f), new Color(.98f,.52f,.22f)),
            new FictionalTeam("Moonfield Foxes", new Color(.33f,.42f,.74f), new Color(.84f,.77f,.93f)),
            new FictionalTeam("River Comets", new Color(.21f,.71f,.64f), new Color(.41f,.30f,.49f)),
            new FictionalTeam("Skyward Nomads", new Color(.52f,.69f,.83f), new Color(.92f,.55f,.39f))
        };
    }
}
