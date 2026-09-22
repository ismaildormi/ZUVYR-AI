/**
 * Educational pattern: one logical request -> one durable task.
 * In production, back this with a database UNIQUE constraint on idempotency_key.
 */

class TaskStore {
  constructor() {
    this.byKey = new Map();
  }

  createOrGet({ idempotencyKey, input }) {
    const existing = this.byKey.get(idempotencyKey);
    if (existing) return { task: existing, created: false };

    const task = {
      id: crypto.randomUUID(),
      idempotencyKey,
      input,
      state: "queued",
      result: null,
      error: null,
    };

    this.byKey.set(idempotencyKey, task);
    return { task, created: true };
  }
}

export async function submitTask(store, request) {
  if (!request.idempotencyKey) {
    throw new Error("idempotency_key_required");
  }

  return store.createOrGet({
    idempotencyKey: request.idempotencyKey,
    input: request.input,
  });
}
