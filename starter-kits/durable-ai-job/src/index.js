import { randomUUID } from "node:crypto";

const tasks = new Map();
const reservations = new Map();
let available = 100;

function submit({ idempotencyKey, input, maxCost }) {
  if (tasks.has(idempotencyKey)) return tasks.get(idempotencyKey);
  if (available < maxCost) throw new Error("insufficient_budget");

  available -= maxCost;
  reservations.set(idempotencyKey, { maxCost, state: "reserved" });

  const task = {
    id: randomUUID(),
    idempotencyKey,
    input,
    state: "queued",
  };
  tasks.set(idempotencyKey, task);
  return task;
}

async function run(task) {
  if (task.state !== "queued") return task;
  task.state = "running";

  try {
    // Replace with your provider/tool call.
    const result = { text: `Processed: ${task.input}` };
    const actualCost = 2;

    const reservation = reservations.get(task.idempotencyKey);
    if (reservation.state === "reserved") {
      available += reservation.maxCost - actualCost;
      reservation.actualCost = actualCost;
      reservation.state = "settled";
    }

    task.result = result;
    task.state = "succeeded";
  } catch (error) {
    const reservation = reservations.get(task.idempotencyKey);
    if (reservation?.state === "reserved") {
      available += reservation.maxCost;
      reservation.state = "refunded";
    }
    task.error = error.message;
    task.state = "failed";
  }

  return task;
}

const request = { idempotencyKey: "demo-001", input: "hello", maxCost: 5 };
const first = submit(request);
const retry = submit(request);

console.log("same task:", first.id === retry.id);
console.log("before:", { task: first, available });
console.log("after:", { task: await run(first), available });
