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
 * True when the month map carries a committed closure marker. The closure
 * flag lives at `leaderboard/{period}/_closed` so that score submissions and
 * finalization share ONE transactional parent (`leaderboard/{period}`) and
 * therefore serialize deterministically (RTDB transactions are atomic only at
 * their own path — unrelated paths do NOT serialize).
 */
function isClosed(month) {
  return Boolean(month && month._closed && month._closed.closed === true);
}

/**
 * Submit-side transaction update function. Receives the current month map
 * (all scores + optional `_closed` marker) and a candidate submission. Returns
 * the updated month map, or undefined to abort:
 *   - month already closed  -> abort (submission rejected; finalization won)
 *   - candidate is not a score upgrade -> abort (idempotent replay; no write)
 * Otherwise merges the candidate with keepBest semantics (no downgrade).
 *
 * @param {object|null} currentMonth   current value at leaderboard/{period}
 * @param {object} candidate           { id, name, score, month, timestamp }
 * @returns {object|undefined}         updated month map, or undefined to abort.
 */
function mergeSubmission(currentMonth, candidate) {
  if (isClosed(currentMonth)) return undefined; // finalization won the race
  const month = currentMonth ? Object.assign({}, currentMonth) : {};
  const best = keepBest(month[candidate.id], candidate);
  if (best === undefined) return undefined; // no upgrade; idempotent
  month[candidate.id] = best;
  return month;
}

/**
 * Finalize-side transaction update function. Receives the current month map
 * and returns it with the closure marker set (including the deterministic
 * Top-10 snapshot), or undefined to abort if already closed (idempotent).
 *
 * The closure marker and the snapshot are written atomically with the month
 * data because they live under the same transactional parent, so a concurrent
 * submission cannot slip in after closure.
 *
 * @param {object|null} currentMonth
 * @param {string} period
 * @param {number} now           epoch ms
 * @returns {object|undefined}
 *
 * IMPORTANT: the _closed marker lives at leaderboard/{period}/_closed, which is
 * readable by any authenticated client (it inherits the parent .read). It
 * therefore carries NO admin UID and NO private evidence — only the closure
 * flag, the timestamp, and the public Top-10 snapshot. The admin UID is written
 * separately to competition/{period}/_finalizedBy (admin-only read).
 */
function buildClosure(currentMonth, period, now) {
  if (isClosed(currentMonth)) return undefined; // already closed; idempotent
  const month = currentMonth ? Object.assign({}, currentMonth) : {};
  const entries = topTen(currentMonth); // snapshot (topTen filters _closed out)
  month._closed = {
    closed: true,
    finalizedAt: now,
    entries: entries
  };
  return month;
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
  isClosed,
  mergeSubmission,
  buildClosure,
  shouldFinalize,
  shouldAward,
  topTen
};
