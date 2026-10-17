/**
 * مخزن حالة بسيط وقابل للتنبؤ: كل تغيير ينتج كائن حالة جديد ثم يبلّغ المشتركين.
 */
export function createStore(initial) {
  let state = Object.freeze({ ...initial });
  const listeners = new Set();

  return {
    get: () => state,

    set(patch) {
      state = Object.freeze({ ...state, ...patch });
      listeners.forEach((fn) => fn(state));
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
