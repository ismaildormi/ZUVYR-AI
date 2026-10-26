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
 *  Matches the C# LeaderboardEntry.SanitiseName (Unicode letter/digit aware,
 *  all-whitespace -> "NEO"). */
function sanitizeName(raw) {
  if (typeof raw !== "string" || raw.length === 0) return "NEO";
  if (raw.trim().length === 0) return "NEO"; // all-whitespace -> NEO (matches C# IsNullOrWhiteSpace)
  let out = "";
  for (const ch of raw) {
    const c = ch.toUpperCase();
    if (/[\p{L}\p{N}]/u.test(c)) out += c; // Unicode letter or digit (matches C# IsLetterOrDigit)
    else if (c === " ") out += ".";
  }
  if (out.length === 0) return "NEO";
  if (out.length > NAME_MAX) out = out.slice(0, NAME_MAX);
  return out;
}

/** Score sanity check (server-authoritative; mirrors RTDB validate rules).
 *  Requires a finite integer within [SCORE_MIN, SCORE_MAX] to match the
 *  client's int score type. */
function validateScore(score) {
  return typeof score === "number" &&
    Number.isFinite(score) &&
    Number.isInteger(score) &&
    score >= SCORE_MIN &&
    score <= SCORE_MAX;
}

/**
 * Returns the value to persist for a score submission, or undefined to abort
 * the write (keep the existing best). Used inside a Firebase transaction so
 * the read-modify-write is ATOMIC and cannot let a concurrent lower score
 * overwrite a higher one (TOCTOU race). When upgrading, the existing
 * timestamp is preserved for tie-break stability.
 *
 * @param {object|null} current   existing entry at the uid node (or null)
 * @param {object} candidate       { id, name, score, month, timestamp }
 * @returns {object|undefined}     entry to write, or undefined to abort.
 */
function keepBest(current, candidate) {
  const curScore = current && typeof current.score === "number" ? current.score : -Infinity;
  if (curScore >= candidate.score) {
    return undefined; // no downgrade; keep existing best (and original timestamp)
  }
  return {
    id: candidate.id,
    name: candidate.name,
    score: candidate.score,
    month: candidate.month,
    timestamp: current ? current.timestamp : candidate.timestamp
  };
}

/**
 * Returns the finalized snapshot to write, or undefined to abort (already
 * finalized). Makes finalization atomic + idempotent under a transaction so
 * two concurrent admin calls cannot overwrite a closed month.
 */
function shouldFinalize(current, final) {
  return current ? undefined : final;
}

/**
 * Returns the award record to write, or undefined to abort (already awarded).
 * Makes prize awarding atomic + idempotent so duplicate calls cannot award
 * twice or overwrite a prior award.
 */
function shouldAward(current, award) {
  return current ? undefined : award;
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
  keepBest,
  shouldFinalize,
  shouldAward,
  topTen
};
