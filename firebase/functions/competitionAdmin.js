"use strict";

// Admin-gated competition lifecycle operations: finalize, verify, award.
//
// All three require an admin caller (UID listed in /config/adminUids) and log
// the acting admin for audit. The official Top-10 is snapshotted into an
// IMMUTABLE node (competition/{month}/final) so ranking cannot be changed
// after finalization. Winners are verified BEFORE prizes are awarded, and the
// award only records the (already-verified) Top-3.

const functions = require("firebase-functions");
const {
  monthKey,
  isValidMonthKey,
  topTen,
  requireAdmin,
  admin
} = require("./shared");

/** Snapshots a month's Top-10 and freezes the ranking. Idempotent. */
exports.finalizeMonth = functions.https.onRequest(async (req, res) => {
  const adminUser = await requireAdmin(req, res);
  if (!adminUser) return;

  const period = req.query.month || monthKey(new Date());
  if (!isValidMonthKey(period)) {
    res.status(400).send({ ok: false, error: "Invalid month." });
    return;
  }

  const db = admin.database().ref();

  // Idempotent: do not overwrite an existing finalized snapshot.
  const existing = await db.child(`/competition/${period}/final`).once("value");
  if (existing.exists()) {
    res.status(200).send({ ok: true, idempotent: true });
    return;
  }

  const snap = await db.child(`/leaderboard/${period}`).once("value");
  const final = {
    month: period,
    finalizedAt: Date.now(),
    finalizedBy: adminUser.uid,
    entries: topTen(snap.val())
  };

  await db.child(`/competition/${period}/final`).set(final);
  functions.logger.log(`[finalizeMonth] ${period} finalized by ${adminUser.uid}`);
  res.status(200).send({ ok: true });
});

/**
 * Records winner verification for a finalized month. Body:
 * { "verified": { "<uid>": { "verified": bool, "note": string } } }
 * Only the Top-3 are recorded. Prizes must not be awarded until all Top-3
 * are verified.
 */
exports.verifyWinners = functions.https.onRequest(async (req, res) => {
  const adminUser = await requireAdmin(req, res);
  if (!adminUser) return;

  const period = req.query.month;
  if (!period) {
    res.status(400).send({ ok: false, error: "month required." });
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
      verified: Boolean(payload[w.id] && payload[w.id].verified),
      note: payload[w.id] ? payload[w.id].note : ""
    }))
  };

  await admin.database().ref(`/competition/${period}/verification`).set(verification);
  functions.logger.log(`[verifyWinners] ${period} verified by ${adminUser.uid}`);
  res.status(200).send({ ok: true });
});

/**
 * Records prize awarding for a finalized, verified month. Refuses to award
 * unless all Top-3 winners have been verified.
 */
exports.awardPrizes = functions.https.onRequest(async (req, res) => {
  const adminUser = await requireAdmin(req, res);
  if (!adminUser) return;

  const period = req.query.month;
  if (!period) {
    res.status(400).send({ ok: false, error: "month required." });
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
  await admin.database().ref(`/competition/${period}/award`).set(award);
  functions.logger.log(`[awardPrizes] ${period} awarded by ${adminUser.uid}`);
  res.status(200).send({ ok: true });
});
