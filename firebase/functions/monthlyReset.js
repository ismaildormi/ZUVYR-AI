"use strict";

// Reliable, idempotent monthly rollover.
//
// Runs on a UTC schedule at 00:00 on the 1st of each month. For the PREVIOUS
// month it:
//   1. archives leaderboard/{previous} -> archive/{previous} (immutable history),
//   2. removes leaderboard/{previous} (the current month starts empty).
//
// Idempotent: if archive/{previous} already exists, the function skips, so a
// re-run (or a back-to-back schedule trigger) cannot destroy the archive or
// delete history twice. The current month is never touched, so there is no
// per-device or global reset.

const functions = require("firebase-functions");
const { monthKey, previousMonthKey, admin } = require("./shared");

exports.monthlyReset = functions.pubsub.schedule("0 0 1 * *").onRun(async () => {
  const period = monthKey(new Date());
  const previous = previousMonthKey(period);

  const db = admin.database().ref();

  // Idempotent guard: only archive once.
  const archived = await db.child(`/archive/${previous}`).once("value");
  if (archived.exists()) {
    functions.logger.log(`[monthlyReset] ${previous} already archived; skipping.`);
    return null;
  }

  const snapshot = await db.child(`/leaderboard/${previous}`).once("value");
  if (!snapshot.exists()) {
    functions.logger.log(`[monthlyReset] ${previous} had no standings; skipping.`);
    return null;
  }

  // Archive first (immutable copy), then clear the live period.
  await db.child(`/archive/${previous}`).set(snapshot.val());
  await db.child(`/leaderboard/${previous}`).remove();

  functions.logger.log(`[monthlyReset] archived ${previous} -> archive/${previous}`);
  return null;
});
