"use strict";

// Pure-logic tests for the competition Cloud Functions. These run with plain
// Node (no firebase-admin, no emulator) and cover period math (including
// year boundaries), name sanitisation, score validation, and the authoritative
// Top-10 ranking / tie-breaking.

const assert = require("assert");
const L = require("../shared-logic");

let pass = 0;
let fail = 0;

function check(cond, name) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; console.log("  FAIL  " + name); }
}

console.log("== monthKey / timezone ==");
check(L.TIMEZONE === "UTC", "single documented timezone UTC");
check(L.monthKey(new Date("2026-10-26T12:00:00Z")) === "2026-10", "month key 2026-10");
check(L.monthKey(new Date("2026-01-01T00:00:00Z")) === "2026-01", "month key 2026-01 (year start)");
check(L.monthKey(new Date("2026-12-31T23:59:59Z")) === "2026-12", "month key 2026-12 (year end)");

console.log("== isValidMonthKey ==");
check(L.isValidMonthKey("2026-10"), "valid 2026-10");
check(!L.isValidMonthKey("2026-13"), "invalid 13");
check(!L.isValidMonthKey("2026-00"), "invalid 00");
check(!L.isValidMonthKey("bad"), "malformed");

console.log("== previousMonthKey (year boundaries) ==");
check(L.previousMonthKey("2026-01") === "2025-12", "Jan -> Dec (year boundary)");
check(L.previousMonthKey("2026-12") === "2026-11", "Dec -> Nov");
check(L.previousMonthKey("2020-01") === "2019-12", "2020 -> 2019");

console.log("== sanitizeName ==");
check(L.sanitizeName(null) === "NEO", "null -> NEO");
check(L.sanitizeName("") === "NEO", "empty -> NEO");
check(L.sanitizeName("hello world") === "HELLO.WORLD", "spaces -> dots, uppercase");
check(L.sanitizeName("a!@#b") === "AB", "symbols stripped");
check(L.sanitizeName(new Array(30).fill("x").join("")).length === 24, "capped at 24");

console.log("== validateScore ==");
check(L.validateScore(0), "0 valid");
check(L.validateScore(1000000), "large valid");
check(!L.validateScore(-1), "negative rejected");
check(!L.validateScore(L.SCORE_MAX + 1), "overflow rejected");
check(!L.validateScore("100"), "non-number rejected");
check(!L.validateScore(NaN), "NaN rejected");
check(!L.validateScore(Infinity), "Infinity rejected");

console.log("== topTen ranking + tie-break ==");
const entries = {};
entries["u1"] = { id: "u1", name: "A", score: 100, timestamp: 1, month: "2026-10" };
entries["u2"] = { id: "u2", name: "B", score: 200, timestamp: 2, month: "2026-10" };
entries["u3"] = { id: "u3", name: "C", score: 100, timestamp: 3, month: "2026-10" };
entries["u4"] = { id: "u4", name: "D", score: 50, timestamp: 4, month: "2026-10" };
const top = L.topTen(entries);
check(top.length === 4, "all entries ranked");
check(top[0].id === "u2", "highest score first");
check(top[1].id === "u1", "tie broken by earlier timestamp (A ts=1 before C ts=3)");
check(top[2].id === "u3", "later timestamp ranks below earlier");
check(top[3].id === "u4", "lowest score last");
check(top[0].rank === 1, "rank assigned from 1");

console.log("== topTen truncates to 10 ==");
const many = {};
for (let i = 0; i < 15; i++)
  many["u" + i] = { id: "u" + i, name: "N" + i, score: i * 10, timestamp: i, month: "2026-10" };
const top10 = L.topTen(many);
check(top10.length === 10, "only 10 returned");
check(top10[0].score === 140, "highest first");
check(top10[9].score === 50, "10th correct");

console.log("== topTen handles null / malformed ==");
check(L.topTen(null).length === 0, "null -> empty");
check(L.topTen({ bad: { noScore: true } }).length === 0, "entry without score skipped");

console.log("== topTen full-tie name break ==");
const tie = {};
tie["b"] = { id: "b", name: "B", score: 100, timestamp: 1, month: "2026-10" };
tie["a"] = { id: "a", name: "A", score: 100, timestamp: 1, month: "2026-10" };
const tied = L.topTen(tie);
check(tied[0].name === "A", "full tie (score+timestamp) broken by name ordinal");

console.log("== validateScore (integer enforcement) ==");
check(L.validateScore(100), "integer accepted");
check(!L.validateScore(100.5), "non-integer rejected");
check(!L.validateScore(0.1), "fractional rejected");
check(L.validateScore(0), "zero accepted");

console.log("== sanitizeName (unicode alignment with C#) ==");
check(L.sanitizeName("café") === "CAFÉ", "accented letters preserved");
check(L.sanitizeName("Héllo Wörld") === "HÉLLO.WÖRLD", "accented + space -> dot");
check(L.sanitizeName("  ") === "NEO", "all-spaces -> NEO");

console.log("== keepBest (atomic best-score merge) ==");
const cNull = L.keepBest(null, { id: "u", name: "N", score: 100, month: "2026-10", timestamp: 1 });
check(cNull && cNull.score === 100 && cNull.timestamp === 1, "null current -> write candidate");
const curHigh = { id: "u", name: "N", score: 100, month: "2026-10", timestamp: 5 };
check(L.keepBest(curHigh, { id: "u", name: "N", score: 50, month: "2026-10", timestamp: 9 }) === undefined,
  "lower score aborts (no downgrade)");
check(L.keepBest(curHigh, { id: "u", name: "N", score: 100, month: "2026-10", timestamp: 9 }) === undefined,
  "equal score aborts (no rewrite, preserves timestamp)");
const curLow = { id: "u", name: "N", score: 50, month: "2026-10", timestamp: 5 };
const up = L.keepBest(curLow, { id: "u", name: "N", score: 100, month: "2026-10", timestamp: 9 });
check(up && up.score === 100, "higher score upgrades");
check(up && up.timestamp === 5, "upgrade preserves original timestamp (tie-break stability)");

console.log("== shouldFinalize (idempotent finalization) ==");
check(L.shouldFinalize(null, { month: "2026-10" }) !== undefined, "null current -> write final");
check(L.shouldFinalize({ month: "2026-10" }, { month: "2026-10" }) === undefined,
  "existing final -> abort (idempotent, no overwrite)");

console.log("== shouldAward (idempotent awarding) ==");
check(L.shouldAward(null, { month: "2026-10" }) !== undefined, "null current -> write award");
check(L.shouldAward({ month: "2026-10" }, { month: "2026-10" }) === undefined,
  "existing award -> abort (no double award)");

console.log("== isClosed (closure marker) ==");
check(!L.isClosed(null), "null month not closed");
check(!L.isClosed({}), "empty month not closed");
check(!L.isClosed({ _closed: { closed: false } }), "open marker not closed");
check(L.isClosed({ _closed: { closed: true } }), "closed marker is closed");

console.log("== mergeSubmission (submit transaction update) ==");
const mk = (id, score, ts) => ({ id, name: "N", score, month: "2026-10", timestamp: ts });
const merged = L.mergeSubmission(null, mk("u1", 100, 1));
check(merged && merged.u1 && merged.u1.score === 100, "null month -> add candidate");
check(merged._closed === undefined, "open month has no closure marker");

const openMonth = { u1: mk("u1", 50, 5) };
const upMerged = L.mergeSubmission(openMonth, mk("u1", 100, 9));
check(upMerged && upMerged.u1.score === 100, "open month + upgrade -> upgraded");
check(upMerged && upMerged.u1.timestamp === 5, "upgrade preserves original timestamp");

check(L.mergeSubmission(openMonth, mk("u1", 10, 9)) === undefined, "open month + downgrade -> abort");
check(L.mergeSubmission(openMonth, mk("u1", 50, 9)) === undefined, "open month + equal -> abort (idempotent)");

const closedMonth = { u1: mk("u1", 50, 5), _closed: { closed: true } };
check(L.mergeSubmission(closedMonth, mk("u2", 999, 9)) === undefined, "closed month + submit -> abort (finalization won)");

console.log("== buildClosure (finalize transaction update) ==");
const m1 = { u1: mk("u1", 300, 1), u2: mk("u2", 200, 2) };
const closed = L.buildClosure(m1, "2026-10", 1000);
check(closed && L.isClosed(closed), "open month -> closed with marker");
check(closed._closed.entries.length === 2, "closure captures Top-10 snapshot");
check(closed._closed.entries[0].score === 300, "snapshot ranked highest first");
check(closed._closed.finalizedBy === undefined, "closure marker carries NO admin UID (auth-readable)");
check(closed._closed.entries[0].id === "u1", "closure snapshot includes winner id");
check(L.buildClosure(closed, "2026-10", 2000) === undefined, "already closed -> abort (idempotent, no overwrite)");

console.log("== Race orderings (deterministic serialization) ==");
// Submission wins first: submit commits, then finalize captures it.
const submitFirst = L.buildClosure(L.mergeSubmission(null, mk("u1", 100, 1)), "2026-10", 10);
check(submitFirst && submitFirst._closed.entries.some(e => e.id === "u1"), "submission-first: score included in snapshot");
// Finalization wins first: finalize commits, then submit is rejected.
const finalizeFirst = L.mergeSubmission(L.buildClosure(null, "2026-10", 10), mk("u1", 100, 1));
check(finalizeFirst === undefined, "finalization-first: late submission rejected");

console.log("== Concurrent submissions (atomic best-score) ==");
let month2 = null;
month2 = L.mergeSubmission(month2, mk("u1", 50, 1));
month2 = L.mergeSubmission(month2, mk("u1", 200, 2));
const third = L.mergeSubmission(month2, mk("u1", 100, 3)); // lower after higher
check(third === undefined, "concurrent: lower-after-higher aborts (no downgrade)");
check(month2.u1.score === 200, "concurrent: highest score retained");
check(month2.u1.timestamp === 1, "concurrent: earliest best-score timestamp preserved");

console.log("== Immutable finalized history ==");
const frozen = L.buildClosure({ u1: mk("u1", 100, 1) }, "2026-10", 10);
check(L.mergeSubmission(frozen, mk("u1", 999, 9)) === undefined, "no mutation of finalized scores");
check(L.buildClosure(frozen, "2026-10", 20) === undefined, "no overwrite of finalized snapshot");

console.log("== Read-access policy (rules structure) ==");
const fs = require("fs");
const path = require("path");
const rulesPath = path.join(__dirname, "..", "..", "rules", "leaderboard.rules.json");
const rules = JSON.parse(fs.readFileSync(rulesPath, "utf8"));
const comp = rules.rules.competition.$period;
check(comp.verification[".read"] === false, "verification.read = false (admin-only via Admin SDK)");
check(comp.award[".read"] === false, "award.read = false (admin-only via Admin SDK)");
check(comp._finalizedBy[".read"] === false, "_finalizedBy.read = false (admin UID not exposed)");
check(comp.final[".read"] === "auth != null", "final.read = auth != null (public Top-10)");
check(comp._status[".read"] === "auth != null", "_status.read = auth != null (public display)");
check(!(".read" in comp), "competition/$period has NO parent .read (no cascade to private children)");
check(rules.rules.config[".read"] === false, "config.read = false");
check(rules.rules.leaderboard.$period[".read"] === "auth != null", "current leaderboard readable by auth");

console.log("");
console.log(`RESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
