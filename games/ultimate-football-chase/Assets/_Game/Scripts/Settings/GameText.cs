namespace UltimateFootballChase.Settings
{
    /// <summary>Small authored localization starter. Legacy uGUI font has no verified Arabic shaping/RTL.</summary>
    public static class GameText
    {
        public static string Get(string key, string language)
        {
            switch (key)
            {
                case "account": return Pick(language, "الحساب", "COMPTE", "ACCOUNT");
                case "wheel": return Pick(language, "عجلة يومية", "ROUE DU JOUR", "DAILY WHEEL");
                case "settings": return Pick(language, "الإعدادات", "PARAMÈTRES", "SETTINGS");
                case "missions": return Pick(language, "مهام يومية", "MISSIONS", "MISSIONS");
                case "interact": return Pick(language, "تفاعل", "INTERAGIR", "INTERACT");
                case "run": return Pick(language, "ابدأ الجري", "DÉMARRER", "START RUN");
                case "music": return Pick(language, "موسيقى اللعبة", "MUSIQUE", "MUSIC");
                case "effects": return Pick(language, "المؤثرات", "EFFETS", "SFX");
                case "ownmusic": return Pick(language, "موسيقاي", "MA MUSIQUE", "USE MY MUSIC");
                case "haptics": return Pick(language, "الاهتزاز", "VIBRATION", "HAPTICS");
                case "language": return Pick(language, "اللغة", "LANGUE", "LANGUAGE");
                case "region": return Pick(language, "المنطقة", "RÉGION", "REGION");
                case "on": return Pick(language, "نعم", "OUI", "ON");
                case "off": return Pick(language, "لا", "NON", "OFF");
                case "story1": return Pick(language,
                    "أنهت بطاقة حمراء ظالمة مباراة واعدة. اعبر المسارات الرمزية لتبحث عن الحقيقة.",
                    "Un carton rouge injuste met fin au match. Traverse les chemins symboliques pour découvrir la vérité.",
                    "An unfair red card ends a promising match. Cross the symbolic castle paths to find the truth.");
                case "story2": return Pick(language,
                    "يبدأ منافسون جدد في سد الطريق. راقب المسارات، لا راياتهم.",
                    "De nouveaux rivaux barrent la route. Observe les voies, pas leurs bannières.",
                    "Original challengers begin to slide into your path. Watch the lanes, not their banners.");
                case "story3": return Pick(language,
                    "تضيق دوريات خيالية وطائرات مراقبة الطريق. قد تغير جولتك التالية القصة.",
                    "Des patrouilles fictives et des drones resserrent le parcours. La prochaine course peut changer l'histoire.",
                    "Fictional patrol vehicles and drones tighten the route. Your next run can change the story.");
                case "story4": return Pick(language,
                    "الحكم الفاسد وراء البوابة. مواجهة الزعيم تحتاج إلى نسخة مستقلة.",
                    "L'arbitre corrompu attend au-delà du portail. Le combat final demande une version dédiée.",
                    "The corrupt official is still beyond the gate. This chapter's boss encounter needs a dedicated build.");
                default: return key;
            }
        }
        private static string Pick(string language, string arabic, string french, string english) =>
            language == "ar" ? arabic : language == "fr" ? french : english;
    }
}
