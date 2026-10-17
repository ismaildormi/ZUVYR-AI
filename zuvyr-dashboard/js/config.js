/**
 * إعدادات اللوحة. عدّل هنا فقط لتغيير السلوك دون لمس الواجهة.
 *
 * - api.*        : مسارات الـ Gateway (يمرّرها server.js إلى 127.0.0.1:5000)
 * - media.*      : مسارات الوسائط المحلية (تُقدَّم من ZUVYR_MEDIA_ROOT)
 * - defaults.*   : القيم الافتراضية قبل أن يغيّرها المستخدم
 */
export const CONFIG = Object.freeze({
  brand: {
    name: 'ZUVYR',
    product: 'True Automation Core',
  },

  api: {
    dashboard: '/api/zuvyr-dashboard',
    masterRun: '/api/zuvyr-dashboard/master-run',
    timeoutMs: 6000,
    masterRunTimeoutMs: 180000,
  },

  media: {
    base: '/media',
    folders: {
      videos: 'videos_pool',
      scripts: 'scripts_pool',
    },
  },

  defaults: {
    lang: 'ar',
    theme: 'dark',
    refreshMs: 15000,
    hidden: [],
  },

  refreshOptions: [
    { value: 5000, label: '5s' },
    { value: 15000, label: '15s' },
    { value: 30000, label: '30s' },
    { value: 0, labelKey: 'settings.off' },
  ],

  languages: ['ar', 'en'],
  themes: ['dark', 'light'],
});
