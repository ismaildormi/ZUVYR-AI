# ZUVYR Dashboard · لوحة قيادة الأتمتة

لوحة تحكم داكنة بالكامل من جانب العميل (HTML + CSS + JavaScript بدون أطر عمل)، بواجهة عربية RTL مع تبديل إلى الإنجليزية، وستة وحدات مستقلة في بطاقات منفصلة، مرتبطة بالـ Gateway المحلي على `http://127.0.0.1:5000`.

## التشغيل

```bash
# 1) الـ Gateway (Flask) على المنفذ 5000
pip install -r zuvyr-dashboard/gateway/requirements.txt
python zuvyr-dashboard/gateway/app.py

# 2) الواجهة (بدون تبعيات) على http://127.0.0.1:8080
node zuvyr-dashboard/server.js

# اختياري: تشغيل الوسائط المحلية من مجلد ما
ZUVYR_MEDIA_ROOT=/path/to/media node zuvyr-dashboard/server.js
```

المتغيرات المدعومة في `server.js`: `PORT` و`HOST` و`BACKEND_URL` (افتراضياً `http://127.0.0.1:5000`) و`ZUVYR_MEDIA_ROOT`.

## لماذا يوجد خادم وسيط؟

الـ Gateway لا يرسل ترويسات CORS، لذلك لا يستطيع المتصفح استدعاءه مباشرة. يمرّر `server.js` طلبات `/api/*` إلى الـ Gateway بنفس الأصل (same-origin)، ويقدّم ملفات الوسائط عبر `/media/<folder>/<file>` مع دعم `Range` للفيديو. عند تعطّل الـ Gateway تُعاد استجابة `502` بصيغة JSON، وتظهر الواجهة حالة "غير متصل" دون بيانات وهمية.

## الوحدات الست

| # | الوحدة | المحتوى |
|---|--------|---------|
| 01 | محرك الوسائط اللامتناهي · Infinite Media Engine | ملفات السيناريو، لغات الترجمة، معاينة النص |
| 02 | محرك الرسوم المتحركة · Cartoon Animation Engine | مشغّل عمودي، عداد دقائق المشاهدة، الجدول الزمني |
| 03 | الأطفال والموسيقى · Kids & Music Core | درع الحماية (نسبة)، تصفية المحتوى حسب النوع |
| 04 | العلامة والصور المصغّرة · Branding & Thumbnail Engine | معرض الصور مع عرض مكبّر (Lightbox) |
| 05 | ذكاء الأعمال · Infinite Business Intelligence | عدادات الأداء، التكاملات، المستندات الاستراتيجية |
| 06 | المُنسِّق ذاتي التطور · Self-Evolution Orchestrator | زر التشغيل الرئيسي، حالة الحماية، سجل التشغيل |

الوحدة تُعرَّف بعقد واحد: `mount(body, ctx)` يعيد `{ render(state) }`، وتُسجَّل في `js/modules/index.js`.

## الميزات

- **الهوية**: ألوان ZUVYR (`#0B0F1A` و`#6366F1` و`#8B5CF6`) مع تدرجات مستمدة من `frontend/rox-brand-blue-violet.css`.
- **الخطوط**: Tajawal للعربية والإنجليزية، وIBM Plex Mono للأرقام والسجلات، وكلاهما مستضاف محلياً.
- **المظهر**: داكن افتراضياً مع وضع فاتح، ويُحفظ الاختيار.
- **اللغة**: عربي (RTL) وإنجليزي (LTR)، وتُحدَّث النصوص الثابتة فورياً عبر `data-i18n`.
- **التنقل**: شريط وحدات ثابت مع تتبّع للقسم الظاهر (scroll-spy).
- **الإعدادات**: إظهار/إخفاء كل وحدة، ومدة التحديث التلقائي (5 ثوانٍ، 15 ثانية، 30 ثانية، أو إيقاف)، وإعادة الضبط. لا يمكن إخفاء كل الوحدات معاً.
- **الحفظ**: التفضيلات في `localStorage` تحت المفتاح `zuvyr-dashboard:prefs:v1`.
- **الأداء**: التحديث الدوري يتوقف عندما تكون الصفحة مخفية، ويُعاد رسم البطاقات فقط عند تغيّر الحالة.
- **الأمان**: سياسة CSP صارمة (`style-src 'self'`، بدون `style` مضمّنة)، ولا يدخل نص من الـ API إلا عبر `textContent`، والأيقونات من ثابت داخلي فقط.
- **إمكانية الوصول**: أزرار بتسميات `aria`، و`aria-live` لسجل التشغيل، ودعم لوحة المفاتيح في المعرض المكبّر (الأسهم، وEsc).

## البنية

```
zuvyr-dashboard/
├── index.html            الهيكل (lang=ar dir=rtl)
├── server.js             خادم ثابت + وسيط /api + وسائط /media (بدون تبعيات)
├── assets/               الشعار وملفات الخطوط
├── css/
│   ├── tokens.css        الألوان والمسافات والظلال (المصدر الوحيد)
│   ├── base.css          إعادة الضبط والخلفية
│   ├── layout.css        الترويسة والهيرو والشبكة والتنقل
│   ├── components.css    البطاقات والأزرار والشرائح والحوارات والإشعارات
│   └── modules.css       مكوّنات كل وحدة
├── js/
│   ├── config.js         الإعدادات (المسارات، المهلات، المجلدات، الافتراضات)
│   ├── main.js           نقطة الدخول والحلقة الرئيسية
│   ├── core/             store · api · i18n · prefs · format · dom
│   ├── ui/               header · layout · settings · parts · icons · toast · lightbox
│   ├── modules/          media · cartoon · kids · brand · bi · evolution · index
│   └── locales/          ar.js · en.js (مفاتيح متطابقة)
└── gateway/              Flask gateway (app.py) كما هو
```

## الإعدادات والتخصيص

- **الألوان والمسافات**: عدّل `css/tokens.css` فقط.
- **النصوص**: أضف المفتاح إلى `js/locales/ar.js` و`en.js` معاً.
- **مجلدات الوسائط**: `CONFIG.media.folders` في `js/config.js`، ويجب أن تطابق `MEDIA_FOLDERS` في `server.js` (حالياً `videos_pool` و`scripts_pool`).
- **التحديث الدوري والمهلات**: `CONFIG.defaults.refreshMs` و`CONFIG.refreshOptions` و`CONFIG.api.timeoutMs` في `js/config.js`.

## ملاحظات

- قوائم الملفات في الـ Gateway مكتوبة يدوياً في `gateway/app.py`، ولا يقرأها من القرص. لذلك قد يُعرض ملف غير موجود محلياً؛ وتظهر عندها رسالة "الملف غير موجود محلياً" بدل فشل صامت.
- نقطة `POST /api/zuvyr-dashboard/master-run` غير موجودة في الـ Gateway الحالي، فيعرض الزر رسالة 404 واضحة في السجل بدل أن يتعطّل.
- الحسابات المالية تظهر "—" حتى يعيد الـ Gateway أرقاماً فعلية في `financial_analytics`، ولا توجد بيانات وهمية.
- `fake_useragent` قد يحتاج إنترنت في أول تشغيل.
