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
  buildClosure,
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

/**
 * Snapshots a month's Top-10 and freezes the ranking. Atomic + idempotent.
 *
 * The closure marker is written at leaderboard/{period}/_closed via a
 * transaction on leaderboard/{period} (the SAME shared transactional parent
 * used by submitScore). This serializes finalization against any concurrent
 * submission, so a score can never land in a month that is being (or has been)
 * finalized. The snapshot is captured atomically inside the closure marker;
 * competition/{period}/final is a public read copy written as a follow-up.
 */
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
  const now = Date.now();

  // Atomic + idempotent closure: write the closure marker (with snapshot)
  // only if the month is not already closed. Two concurrent admin calls
  // cannot overwrite the first committed snapshot.
  let tx;
  try {
    tx = await db.child(`/leaderboard/${period}`).transaction(
      (current) => buildClosure(current, period, now)
    );
  } catch (e) {
    functions.logger.error(`[finalizeMonth] transaction failed for ${period}: ${e.message}`);
    res.status(500).send({ ok: false, error: "Finalize failed; please retry." });
    return;
  }

  // Ensure the public read copy exists. Handles both a fresh close (tx just
  // committed) and an idempotent retry (tx aborted, copy missing from an
  // earlier failed attempt). The public copy carries NO admin UID — that is
  // stored separately in competition/{period}/_finalizedBy (admin-only read).
  let publicSnap = await db.child(`/competition/${period}/final`).once("value");
  if (!publicSnap.exists()) {
    const closed = await db.child(`/leaderboard/${period}/_closed`).once("value");
    if (closed.exists()) {
      const cv = closed.val();
      await db.child(`/competition/${period}/final`).set({
        month: period,
        finalizedAt: cv.finalizedAt,
        entries: cv.entries
      });
    }
  }

  // Admin-only audit record for who finalized this month (not exposed publicly).
  if (tx.committed) {
    await db.child(`/competition/${period}/_finalizedBy`).set({ finalizedBy: adminUser.uid });
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
  const verifiedWinners = top3.map((w) => ({
    rank: w.rank,
    id: w.id,
    name: w.name,
    score: w.score,
    // Strict boolean: only exactly `true` counts as verified.
    verified: Boolean(payload[w.id] && payload[w.id].verified === true),
    note: payload[w.id] ? payload[w.id].note : ""
  }));

  // PRIVATE record (admin-only read): full detail incl. admin UID, winner UID,
  // and verification notes/evidence. Never exposed to public clients.
  const verification = {
    month: period,
    verifiedAt: Date.now(),
    verifiedBy: adminUser.uid,
    winners: verifiedWinners
  };
  await admin.database().ref(`/competition/${period}/verification`).set(verification);

  // PUBLIC display status (auth read): only display fields — no UIDs, no
  // notes, no admin identity. Lets clients show "Verified" without exposing
  // private evidence.
  await admin.database().ref(`/competition/${period}/_status`).set({
    month: period,
    verifiedAt: verification.verifiedAt,
    awardedAt: null,
    awarded: false,
    verified: verifiedWinners.every((w) => w.verified),
    winners: verifiedWinners.map((w) => ({
      rank: w.rank,
      name: w.name,
      score: w.score,
      verified: w.verified
    }))
  });

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

  const top3 = winners.slice(0, 3);
  const awardedAt = Date.now();
  const award = {
    month: period,
    awardedAt: awardedAt,
    awardedBy: adminUser.uid,
    winners: top3
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

  // PRIVATE award record (admin-only read) was written above. Update the
  // PUBLIC display status to reflect the award (display fields only).
  if (tx.committed) {
    const statusRef = admin.database().ref(`/competition/${period}/_status`);
    const existing = await statusRef.once("value");
    const prev = existing.exists() ? existing.val() : { month: period, winners: top3.map((w) => ({ rank: w.rank, name: w.name, score: w.score, verified: w.verified })) };
    await statusRef.set({
      month: period,
      verifiedAt: prev.verifiedAt || null,
      awardedAt: awardedAt,
      awarded: true,
      verified: top3.every((w) => w.verified),
      winners: top3.map((w) => ({ rank: w.rank, name: w.name, score: w.score, verified: w.verified }))
    });
  }

  if (!tx.committed) {
    res.status(200).send({ ok: true, idempotent: true });
    return;
  }

  functions.logger.log(`[awardPrizes] ${period} awarded by ${adminUser.uid}`);
  res.status(200).send({ ok: true });
});
