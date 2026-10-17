import { CONFIG } from '../config.js';

/** خطأ من الـ API يحمل الحالة ورسالة قابلة للعرض */
export class ApiError extends Error {
  constructor(message, { status = null, fromServer = false } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fromServer = fromServer;
  }
}

/** جلب قائمة المحركات والأصول من الـ Gateway */
export async function fetchDashboard() {
  const res = await fetch(CONFIG.api.dashboard, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(CONFIG.api.timeoutMs),
  });

  if (!res.ok) {
    // server.js يعيد رسالة واضحة عند تعذّر الوصول إلى الـ Gateway
    let serverMessage = null;
    try {
      serverMessage = (await res.json()).message || null;
    } catch {
      /* الرد ليس JSON */
    }
    throw new ApiError(serverMessage ?? `HTTP ${res.status}`, {
      status: res.status,
      fromServer: Boolean(serverMessage),
    });
  }

  return res.json();
}

/** تشغيل المحرك الرئيسي. لا يرمي عند أخطاء HTTP، بل يعيد الحالة للعرض */
export async function runMasterRun() {
  try {
    const res = await fetch(CONFIG.api.masterRun, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(CONFIG.api.masterRunTimeoutMs),
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } catch (err) {
    throw new ApiError(err.message || 'network error');
  }
}
