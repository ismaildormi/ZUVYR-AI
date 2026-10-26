"use strict";

// Admin-gated competition lifecycle operations: finalize, verify, award.
//
// All three require an admin caller (UID listed in /config/adminUids) and log
// the acting admin for audit. The official Top-10 is snapshotted into an
// IMMUTABLE node (competition/{month}/final) so ranking cannot be changed
// after finalization. Winners are verified BEFORE prizes are awarded, and the
// award only records the (already-verified) Top-3. Finalization and awarding
// are atomic + idempotent (Firebase transactions), so retries cannot overwrite
// a closed month or award twice.

const functions = require("firebase-functions");
const {
  monthKey,
  isValidMonthKey,
  topTen,
  shouldFinalize,
  shouldAward,
  requireAdmin,
  admin
} = require("./shared");

function methodGuard(req, res) {
  if (req.method !== "POST") {
    res.status(405).send({ ok: false, error: "POST required." });
    return false;
  }
  return true;
}

/** Snapshots a month's Top-10 and freezes the ranking. Atomic + idempotent. */
exports.finalizeMonth = functions.https.onRequest(async (req, res) => {
  if (!methodGuard(req, res)) return;

  const adminUser = await requireAdmin(req, res);
  if (!adminUser) return;

  const period = req.query.month || monthKey(new Date());
  if (!isValidMonthKey(period)) {
    res.status(400).send({ ok: false, error: "Invalid month." });
    return;
  }

  const db = admin.database().ref();

  // Idempotent + atomic: write final only if it does not already exist, so
  // two concurrent admin calls cannot overwrite a closed month.
  const finalSnap = await db.child(`/leaderboard/${period}`).once("value");
  const final = {
    month: period,
    finalizedAt: Date.now(),
    finalizedBy: adminUser.uid,
    entries: topTen(finalSnap.val())
  };

  let tx;
  try {
    tx = await db.child(`/competition/${period}/final`).transaction(
      (current) => shouldFinalize(current, final)
    );
  } catch (e) {
    functions.logger.error(`[finalizeMonth] transaction failed for ${period}: ${e.message}`);
    res.status(500).send({ ok: false, error: "Finalize failed; please retry." });
    return;
  }

  if (!tx.committed) {
    res.status(200).send({ ok: true, idempotent: true });
    return;
  }

  functions.logger.log(`[finalizeMonth] ${period} finalized by ${adminUser.uid}`);
  res.status(200).send({ ok: true });
});

/**
 * Records winner verification for a finalized month. Body:
 * { "verified": { "<uid>": { "verified": bool, "note": string } } }
 * Only the Top-3 (from the immutable finalized snapshot) are recorded.
 * `verified` must be exactly `true` (not a truthy value). Re-verification
 * overwrites the prior record (admin may update outcomes before awarding).
 */
exports.verifyWinners = functions.https.onRequest(async (req, res) => {
  if (!methodGuard(req, res)) return;

  const adminUser = await requireAdmin(req, res);
  if (!adminUser) return;

  const period = req.query.month;
  if (!period || !isValidMonthKey(period)) {
    res.status(400).send({ ok: false, error: "Invalid month." });
    return;
  }

  const fin = await admin.database().ref(`/competition/${period}/final`).once("value");
  if (!fin.exists()) {
    res.status(400).send({ ok: false, error: "Month not finalized." });
    return;
  }

  const payload = (req.body && req.body.verified) || {};
  const top3 = (fin.val().entries || []).slice(0, 3);
  const verification = {
    month: period,
    verifiedAt: Date.now(),
    verifiedBy: adminUser.uid,
    winners: top3.map((w) => ({
      rank: w.rank,
      id: w.id,
      name: w.name,
      score: w.score,
      // Strict boolean: only exactly `true` counts as verified.
      verified: Boolean(payload[w.id] && payload[w.id].verified === true),
      note: payload[w.id] ? payload[w.id].note : ""
    }))
  };

  await admin.database().ref(`/competition/${period}/verification`).set(verification);
  functions.logger.log(`[verifyWinners] ${period} verified by ${adminUser.uid}`);
  res.status(200).send({ ok: true });
});

/**
 * Records prize awarding for a finalized, verified month. Refuses to award
 * unless all Top-3 winners have been verified. Atomic + idempotent: an
 * already-recorded award is never overwritten, so duplicate calls cannot
 * award twice.
 */
exports.awardPrizes = functions.https.onRequest(async (req, res) => {
  if (!methodGuard(req, res)) return;

  const adminUser = await requireAdmin(req, res);
  if (!adminUser) return;

  const period = req.query.month;
  if (!period || !isValidMonthKey(period)) {
    res.status(400).send({ ok: false, error: "Invalid month." });
    return;
  }

  const ver = await admin.database().ref(`/competition/${period}/verification`).once("value");
  if (!ver.exists()) {
    res.status(400).send({ ok: false, error: "No verification on record." });
    return;
  }

  const winners = ver.val().winners || [];
  if (!winners.slice(0, 3).every((w) => w.verified)) {
    res.status(400).send({ ok: false, error: "Top-3 must be verified before awarding." });
    return;
  }

  const award = {
    month: period,
    awardedAt: Date.now(),
    awardedBy: adminUser.uid,
    winners: winners.slice(0, 3)
  };

  let tx;
  try {
    tx = await admin.database().ref(`/competition/${period}/award`).transaction(
      (current) => shouldAward(current, award)
    );
  } catch (e) {
    functions.logger.error(`[awardPrizes] transaction failed for ${period}: ${e.message}`);
    res.status(500).send({ ok: false, error: "Award failed; please retry." });
    return;
  }

  if (!tx.committed) {
    res.status(200).send({ ok: true, idempotent: true });
    return;
  }

  functions.logger.log(`[awardPrizes] ${period} awarded by ${adminUser.uid}`);
  res.status(200).send({ ok: true });
});
