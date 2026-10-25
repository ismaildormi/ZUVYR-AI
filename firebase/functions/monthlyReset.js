/**
 * VELOX — server-authoritative monthly leaderboard reset.
 *
 * This Cloud Function (Firebase Functions v2, scheduled) rolls the monthly
 * competition over at 00:00 UTC on the 1st of each month. It is the ONLY
 * component allowed to clear/archive a competition period. Clients never reset
 * global standings.
 *
 * Deploy:
 *   firebase deploy --only functions:monthlyLeaderboardReset
 *
 * Requires in firebase/functions/package.json:
 *   "firebase-functions": "^5.0.0",
 *   "firebase-admin": "^12.0.0"
 */
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');

initializeApp();
const db = getDatabase();

/** YYYY-MM in UTC. */
function periodKey(date) {
  return date.toISOString().slice(0, 7);
}

exports.monthlyLeaderboardReset = onSchedule(
  {
    schedule: '0 0 1 * *', // 00:00 UTC on the 1st of every month
    timeZone: 'UTC',        // single, explicit competition timezone
    region: 'us-central1'
  },
  async () => {
    const now = new Date();
    const current = periodKey(now);
    const previous = periodKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));

    const root = db.ref('leaderboard');
    // Archive/clear the previous period, then ensure the new period exists.
    await root.child(previous).remove();
    await root.child(current).set({});

    console.log(`[VELOX] Monthly leaderboard rolled over: ${previous} -> ${current}`);
  }
);

/**
 * Optional manual/admin trigger. Deploy behind Firebase App Check / Identity
 * Platform so only authenticated clients can call it. The client points
 * FirebaseConfig.monthlyResetEndpoint at this function's URL.
 */
exports.ensureMonthlyPeriod = onRequest(
  { region: 'us-central1' },
  async (req, res) => {
    const now = new Date();
    const current = periodKey(now);
    const previous = periodKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
    const root = db.ref('leaderboard');
    await root.child(previous).remove();
    await root.child(current).set({});
    res.json({ ok: true, current, previous });
  }
);
