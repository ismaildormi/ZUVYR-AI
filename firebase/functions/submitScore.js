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
const { monthKey, sanitizeName, validateScore, keepBest, requireAuth, admin } = require("./shared");

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

  // Finalized periods are frozen: no further writes.
  const fin = await admin.database().ref(`/competition/${period}/final`).once("value");
  if (fin.exists()) {
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

  // ATOMIC best-score merge via a Firebase transaction. This prevents a
  // concurrent lower-score submission from overwriting a higher one (TOCTOU).
  let tx;
  try {
    tx = await admin.database().ref(`/leaderboard/${period}/${uid}`).transaction(
      (current) => keepBest(current, candidate)
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
    // No downgrade: the existing best was kept. Idempotent replay.
    res.status(200).send({ ok: true, updated: false });
  }
});
