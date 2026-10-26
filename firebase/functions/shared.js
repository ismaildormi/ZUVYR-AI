"use strict";

// Admin-dependent helpers for the Cloud Functions. The pure competition logic
// lives in shared-logic.js (testable without firebase-admin).

const admin = require("firebase-admin");
const logic = require("./shared-logic");

// Initialize the Admin SDK once. In production the runtime provides
// Application Default Credentials; against the emulator it auto-detects the
// emulator env. Guard against double-init (shared.js is a singleton module).
if (!admin.apps || admin.apps.length === 0) {
  admin.initializeApp();
}

const {
  monthKey,
  previousMonthKey,
  sanitizeName,
  validateScore,
  topTen,
  isValidMonthKey
} = logic;

/**
 * Verifies the Firebase Auth ID token from the Authorization: Bearer header.
 * Returns the decoded token, or null after sending a 401 response.
 */
function requireAuth(req, res) {
  const header = req.headers.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m) {
    res.status(401).send({ ok: false, error: "Missing bearer token." });
    return null;
  }
  try {
    return admin.auth().verifyIdToken(m[1], true);
  } catch (e) {
    res.status(401).send({ ok: false, error: "Invalid or expired token." });
    return null;
  }
}

/**
 * Verifies the caller is an admin by checking their UID against the
 * /config/adminUids allowlist. Returns the decoded token, or null after
 * sending a 401/403 response. Admin actions are logged for audit.
 */
async function requireAdmin(req, res) {
  const decoded = requireAuth(req, res);
  if (!decoded) return null;

  const allow = await admin.database().ref("/config/adminUids").once("value");
  const uids = allow.val() || {};
  if (!uids[decoded.uid]) {
    res.status(403).send({ ok: false, error: "Admin privileges required." });
    return null;
  }
  return decoded;
}

module.exports = {
  ...logic,
  requireAuth,
  requireAdmin,
  admin
};
