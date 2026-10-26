"use strict";

// Pure, dependency-free competition logic shared by the Cloud Functions.
// Kept free of firebase-admin so it can be unit-tested with plain Node.

const SCORE_MAX = 1000000000000; // 1e12 sanity bound (NOT a gameplay cap)
const SCORE_MIN = 0;
const NAME_MAX = 24;

// Canonical competition timezone: UTC.
const TIMEZONE = "UTC";

/** Month key (yyyy-MM) for a UTC instant, consistent everywhere. */
function monthKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** True for a well-formed yyyy-MM month with month 01..12. */
function isValidMonthKey(key) {
  return typeof key === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(key);
}

/** The month immediately before `period`, crossing year boundaries. */
function previousMonthKey(period) {
  if (!isValidMonthKey(period)) return period;
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  let y = parseInt(m[1], 10);
  let mo = parseInt(m[2], 10);
  mo -= 1;
  if (mo < 1) { mo = 12; y -= 1; }
  return `${y}-${String(mo).padStart(2, "0")}`;
}

/** Sanitises a display name: uppercase, letters/digits kept, spaces->dots.
 *  Matches the C# LeaderboardEntry.SanitiseName exactly. */
function sanitizeName(raw) {
  if (typeof raw !== "string" || raw.length === 0) return "NEO";
  let out = "";
  for (const ch of raw) {
    const c = ch.toUpperCase();
    if (/[A-Z0-9]/.test(c)) out += c;
    else if (c === " ") out += ".";
  }
  if (out.length === 0) return "NEO";
  if (out.length > NAME_MAX) out = out.slice(0, NAME_MAX);
  return out;
}

/** Score sanity check (server-authoritative; mirrors RTDB validate rules). */
function validateScore(score) {
  return typeof score === "number" &&
    Number.isFinite(score) &&
    score >= SCORE_MIN &&
    score <= SCORE_MAX;
}

/**
 * Authoritative ranking: highest score first; ties broken by earlier
 * timestamp, then name. Returns the Top-10 with rank assigned.
 */
function topTen(entries) {
  return Object.values(entries || {})
    .filter((e) => e && typeof e.score === "number")
    .sort((a, b) =>
      (b.score - a.score) ||
      (a.timestamp - b.timestamp) ||
      String(a.name).localeCompare(String(b.name)))
    .slice(0, 10)
    .map((e, i) => ({
      rank: i + 1,
      id: e.id,
      name: e.name,
      score: e.score,
      month: e.month,
      timestamp: e.timestamp
    }));
}

module.exports = {
  SCORE_MAX,
  SCORE_MIN,
  NAME_MAX,
  TIMEZONE,
  monthKey,
  isValidMonthKey,
  previousMonthKey,
  sanitizeName,
  validateScore,
  topTen
};
