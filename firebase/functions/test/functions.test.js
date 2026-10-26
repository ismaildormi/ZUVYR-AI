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

console.log("");
console.log(`RESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
