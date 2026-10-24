namespace UltimateFootballChase.Characters
{
    /// <summary>Original short text panels; chapter gating is distinct from distance difficulty tiers.</summary>
    public static class HubStory
    {
        public static int ChapterFor(int completedStages) => completedStages >= 31 ? 4 :
            completedStages >= 21 ? 3 : completedStages >= 11 ? 2 : 1;
        public static string Title(int chapter) => chapter == 1 ? "CHAPTER 1 • THE UNFAIR CARD" :
            chapter == 2 ? "CHAPTER 2 • NEW RIVALS" :
            chapter == 3 ? "CHAPTER 3 • WATCHED STREETS" : "CHAPTER 4 • THE HIDDEN OFFICIAL";
        public static string Message(int chapter) => chapter == 1 ?
            "An unfair red card ends a promising match. Cross the symbolic castle paths to find the truth." :
            chapter == 2 ? "Original challengers begin to slide into your path. Watch the lanes, not their banners." :
            chapter == 3 ? "Fictional patrol vehicles and drones tighten the route. Your next run can change the story." :
            "The corrupt official is still beyond the gate. This chapter's boss encounter needs a dedicated build.";
    }
}
