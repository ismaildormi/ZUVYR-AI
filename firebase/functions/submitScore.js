"use strict";

// Server-authoritative score submission.
//
// A client POSTs { name, score } with `Authorization: Bearer <Firebase ID
// token>`. The function:
//   1. verifies the caller's Firebase Auth ID token (stable UID identity),
//   2. computes the competition period server-side (UTC),
//   3. rejects submissions to a finalized period,
//   4. validates the score/name (server is authoritative),
//   5. writes leaderboard/{period}/{uid} keeping the player's BEST score
//      (no silent downgrade), via the admin SDK (bypasses client write rules).
//
// Clients never write to the Realtime Database directly; the RTDB rules set
// .write=false under leaderboard/. This is the server-side enforcement layer.

const functions = require("firebase-functions");
const {
  monthKey,
  sanitizeName,
  validateScore,
  mergeSubmission,
  requireAuth,
  admin
} = require("./shared");

exports.submitScore = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send({ ok: false, error: "POST required." });
    return;
  }

  const decoded = requireAuth(req, res);
  if (!decoded) return;
  const uid = decoded.uid;

  // Trusted period calculation (UTC) — never taken from the client.
  const period = monthKey(new Date());

  // Fast-path rejection: if the closure marker already exists, reject early.
  // (Authoritative check happens inside the transaction below.)
  const closed = await admin.database().ref(`/leaderboard/${period}/_closed`).once("value");
  if (closed.exists() && closed.val().closed === true) {
    res.status(403).send({ ok: false, error: `Period ${period} is finalized.` });
    return;
  }

  const body = req.body || {};
  const score = body.score;
  const name = sanitizeName(body.name);

  if (!validateScore(score)) {
    res.status(400).send({ ok: false, error: "Invalid score." });
    return;
  }

  const candidate = {
    id: uid,
    name: name,
    score: score,
    month: period,
    timestamp: Date.now()
  };

  // ATOMIC submit-vs-finalize serialization: the closure flag lives at
  // leaderboard/{period}/_closed (a child of the score parent), and the
  // score write is a transaction on leaderboard/{period} (the shared
  // transactional parent). Finalization also transacts on leaderboard/{period},
  // so the two operations conflict and serialize deterministically — RTDB
  // transactions are atomic only at their own path, so sharing the parent is
  // what closes the race.
  let tx;
  try {
    tx = await admin.database().ref(`/leaderboard/${period}`).transaction(
      (current) => mergeSubmission(current, candidate)
    );
  } catch (e) {
    functions.logger.error(`[submitScore] transaction failed for uid=${uid}: ${e.message}`);
    res.status(500).send({ ok: false, error: "Could not record score; please retry." });
    return;
  }

  if (tx.committed) {
    functions.logger.log(`[submitScore] uid=${uid} period=${period} score=${score}`);
    res.status(200).send({ ok: true, updated: true });
  } else {
    // Transaction aborted: either the month was closed by a concurrent
    // finalization (race) or the score was not an upgrade (idempotent replay).
    const closed2 = await admin.database().ref(`/leaderboard/${period}/_closed`).once("value");
    if (closed2.exists() && closed2.val().closed === true) {
      res.status(403).send({ ok: false, error: `Period ${period} is finalized.` });
    } else {
      res.status(200).send({ ok: true, updated: false }); // idempotent no-upgrade
    }
  }
});
