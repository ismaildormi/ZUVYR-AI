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
                case "localScore": return Pick(language, "نتيجة محلية", "SCORE LOCAL", "LOCAL SCORE");
                case "unverified": return Pick(language, "غير موثق", "non vérifié", "unverified");
                case "topRun": return Pick(language, "أفضل جولة محلية", "MEILLEURE COURSE", "TOP RUN (local preview)");
                case "mission": return Pick(language, "مهمة", "MISSION", "MISSION");
                case "previewCap": return Pick(language, "بلغت الحد التجريبي", "Plafond de démo atteint", "Preview cap reached");
                case "dodge": return Pick(language, "تفاد", "ÉVITE", "DODGE");
                case "jump": return Pick(language, "اقفز", "SAUTE", "JUMP");
                case "coins": return Pick(language, "عملات", "PIÈCES", "COINS");
                case "testKeys": return Pick(language, "مفاتيح اختبار", "CLÉS TEST", "Test keys");
                case "stage": return Pick(language, "مرحلة", "ÉTAPE", "Stage");
                case "completed": return Pick(language, "مكتملة", "terminées", "Completed");
                case "pause": return Pick(language, "إيقاف مؤقت", "PAUSE", "PAUSED");
                case "resume": return Pick(language, "استمر", "REPRENDRE", "RESUME");
                case "restart": return Pick(language, "أعد الجولة", "RECOMMENCER", "RESTART");
                case "runAgain": return Pick(language, "العب مجددًا", "REJOUER", "RUN AGAIN");
                case "backHub": return Pick(language, "العودة للمركز", "RETOUR AU HUB", "BACK TO HUB");
                case "gameOver": return Pick(language, "بطاقة حمراء\nانتهت الجولة", "CARTON ROUGE\nFIN DE COURSE", "RED CARD\nGAME OVER");
                case "chaser": return Pick(language, "الحكم يقترب!", "LE POURSUIVANT APPROCHE !", "! THE CHASER IS CLOSE !");
                case "dailyChecklist": return Pick(language, "مهام يومية بتوقيت UTC • تجريبية", "LISTE UTC • DÉMO", "UTC DAILY CHECKLIST • PREVIEW ONLY");
                case "completeRun": return Pick(language, "أنهِ جولة", "Terminer une course", "Complete a run");
                case "collectCoins": return Pick(language, "اجمع عملات", "Collecter des pièces", "Collect coins");
                case "travel": return Pick(language, "اقطع مسافة", "Parcourir", "Travel");
                case "noRewards": return Pick(language, "لا مكافآت أو عملات قابلة للإنفاق.",
                    "Aucune récompense ni monnaie dépensable.", "No rewards or account currency issued.");
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
