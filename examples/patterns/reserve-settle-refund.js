/**
 * Educational pattern: reserve before costly execution, then settle or refund.
 * Real systems should persist this transactionally and use exact decimal money.
 */

export class UsageLedger {
  constructor(balance) {
    this.balance = balance;
    this.reservations = new Map();
  }

  reserve({ operationId, maximumCost }) {
    if (this.reservations.has(operationId)) {
      return this.reservations.get(operationId); // idempotent retry
    }

    if (maximumCost < 0 || this.balance < maximumCost) {
      throw new Error("insufficient_balance");
    }

    this.balance -= maximumCost;
    const reservation = { operationId, maximumCost, state: "reserved" };
    this.reservations.set(operationId, reservation);
    return reservation;
  }

  settle({ operationId, actualCost }) {
    const r = this.reservations.get(operationId);
    if (!r) throw new Error("reservation_not_found");
    if (r.state !== "reserved") return r;

    if (actualCost < 0 || actualCost > r.maximumCost) {
      throw new Error("invalid_actual_cost");
    }

    this.balance += r.maximumCost - actualCost;
    r.actualCost = actualCost;
    r.state = "settled";
    return r;
  }

  refund({ operationId }) {
    const r = this.reservations.get(operationId);
    if (!r) throw new Error("reservation_not_found");
    if (r.state !== "reserved") return r;

    this.balance += r.maximumCost;
    r.state = "refunded";
    return r;
  }
}
