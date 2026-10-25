'use strict';
/**
 * VELOX backend module — mount in the existing Express app:
 *   app.use('/velox', require('./velox-leaderboard')({ pool, googleClientId: process.env.GOOGLE_CLIENT_ID, sessionSecret: process.env.VELOX_SESSION_SECRET }));
 * Google ID tokens are verified server-side (never trust the client). Monthly reset is lazy
 * (first request of a new month finalizes the previous one) + schedulable via finalizePreviousPeriod().
 */
const crypto = require('crypto');
function periodId(d = new Date()) { return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; }
function nextReset(d = new Date()) { return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); }

function signSession(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verifySession(token, secret) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return p.exp > Date.now() ? p : null; } catch { return null; }
}

async function verifyGoogleIdToken(idToken, clientId) {
  // Uses Google's tokeninfo endpoint; swap for google-auth-library OAuth2Client.verifyIdToken in production if preferred.
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!res.ok) throw new Error('google_token_invalid');
  const t = await res.json();
  if (t.aud !== clientId) throw new Error('google_audience_mismatch');
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(t.iss)) throw new Error('google_issuer_mismatch');
  if (Number(t.exp) * 1000 < Date.now()) throw new Error('google_token_expired');
  return { googleSub: t.sub, email: t.email || null, displayName: t.name || 'NEO Runner', photoUrl: t.picture || null };
}

function createVeloxRouter({ pool, googleClientId, sessionSecret, verifyGoogle = verifyGoogleIdToken, expressImpl }) {
  if (!pool || !googleClientId || !sessionSecret) throw new Error('velox: pool, GOOGLE_CLIENT_ID and VELOX_SESSION_SECRET are required');
  const express = expressImpl || require('express'); // resolved lazily so pure helpers stay unit-testable without deps
  const router = express.Router();
  router.use(express.json({ limit: '16kb' }));

  async function finalizePreviousPeriod() {
    const current = periodId();
    const { rows } = await pool.query(
      `SELECT DISTINCT period_id FROM velox_scores WHERE period_id <> $1 AND period_id NOT IN (SELECT period_id FROM velox_podiums) ORDER BY period_id`, [current]);
    for (const { period_id } of rows) {
      const top3 = await pool.query(
        `SELECT user_id, display_name, score FROM velox_scores WHERE period_id=$1 ORDER BY score DESC, achieved_at ASC LIMIT 3`, [period_id]);
      for (let i = 0; i < top3.rows.length; i++)
        await pool.query(`INSERT INTO velox_podiums(period_id, rank, user_id, display_name, score) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
          [period_id, i + 1, top3.rows[i].user_id, top3.rows[i].display_name, top3.rows[i].score]);
    }
    return rows.map(r => r.period_id);
  }

  function auth(req, res, next) {
    const p = verifySession((req.headers.authorization || '').replace(/^Bearer\s+/i, ''), sessionSecret);
    if (!p) return res.status(401).json({ error: 'unauthorized' });
    req.veloxUser = p; next();
  }

  router.post('/auth/google', async (req, res) => {
    try {
      const { idToken } = req.body || {};
      if (!idToken || typeof idToken !== 'string') return res.status(400).json({ error: 'idToken_required' });
      const g = await verifyGoogle(idToken, googleClientId);
      const { rows } = await pool.query(
        `INSERT INTO velox_users(google_sub, email, display_name, photo_url) VALUES($1,$2,$3,$4)
         ON CONFLICT (google_sub) DO UPDATE SET email=EXCLUDED.email, display_name=EXCLUDED.display_name, photo_url=EXCLUDED.photo_url, updated_at=now()
         RETURNING id, display_name, email, photo_url`,
        [g.googleSub, g.email, g.displayName, g.photoUrl]);
      const u = rows[0]; const exp = Date.now() + 1000 * 60 * 60 * 24 * 7;
      res.json({ accessToken: signSession({ sub: u.id, name: u.display_name, exp }, sessionSecret), expiresAtUnix: Math.floor(exp / 1000),
                 user: { id: u.id, displayName: u.display_name, email: u.email, photoUrl: u.photo_url } });
    } catch (e) { res.status(401).json({ error: String(e.message || 'auth_failed') }); }
  });

  router.post('/scores', auth, async (req, res) => {
    const score = Number(req.body && req.body.score);
    if (!Number.isInteger(score) || score < 0 || score > 10_000_000) return res.status(400).json({ error: 'invalid_score' });
    await finalizePreviousPeriod();
    const p = periodId();
    await pool.query(
      `INSERT INTO velox_scores(user_id, display_name, period_id, score) VALUES($1,$2,$3,$4)
       ON CONFLICT (user_id, period_id) DO UPDATE SET score=GREATEST(velox_scores.score, EXCLUDED.score),
         display_name=EXCLUDED.display_name, achieved_at=CASE WHEN EXCLUDED.score>velox_scores.score THEN now() ELSE velox_scores.achieved_at END`,
      [req.veloxUser.sub, req.veloxUser.name, p, score]);
    res.status(204).end();
  });

  router.get('/leaderboard/top10', async (req, res) => {
    await finalizePreviousPeriod();
    const p = periodId();
    const { rows } = await pool.query(
      `SELECT user_id, display_name, photo_url, score, RANK() OVER (ORDER BY score DESC, achieved_at ASC) AS rank
       FROM velox_scores WHERE period_id=$1 ORDER BY score DESC, achieved_at ASC LIMIT 10`, [p]);
    let me = null;
    const bearer = verifySession((req.headers.authorization || '').replace(/^Bearer\s+/i, ''), sessionSecret);
    if (bearer) {
      const mine = await pool.query(
        `SELECT display_name, score, (SELECT COUNT(*)+1 FROM velox_scores s2 WHERE s2.period_id=$1 AND s2.score>s.score) AS rank FROM velox_scores s WHERE period_id=$1 AND user_id=$2`, [p, bearer.sub]);
      if (mine.rows[0]) me = { rank: Number(mine.rows[0].rank), displayName: mine.rows[0].display_name, score: mine.rows[0].score, isCurrentUser: true };
    }
    res.json({ periodId: p, resetsAtUnix: Math.floor(nextReset() / 1000),
      entries: rows.map(r => ({ rank: Number(r.rank), displayName: r.display_name, photoUrl: r.photo_url, score: r.score, isCurrentUser: bearer ? r.user_id === bearer.sub : false })), myEntry: me });
  });

  router.get('/leaderboard/podium/:period', async (req, res) => {
    const { rows } = await pool.query(`SELECT rank, display_name, score FROM velox_podiums WHERE period_id=$1 ORDER BY rank`, [req.params.period]);
    res.json({ periodId: req.params.period, winners: rows });
  });

  return { router, finalizePreviousPeriod };
}
module.exports = createVeloxRouter;
module.exports._test = { periodId, nextReset, signSession, verifySession };
