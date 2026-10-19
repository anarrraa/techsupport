import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDate, formatDuration, formatMonth } from "../src/utils/format.ts";

test("formatDuration splits hours and minutes per locale", () => {
  assert.equal(formatDuration(45, "en"), "45m");
  assert.equal(formatDuration(60, "en"), "1h");
  assert.equal(formatDuration(95, "en"), "1h 35m");
  assert.equal(formatDuration(95, "mn"), "1ц 35м");
});

test("formatDate uses YYYY.MM.DD for Mongolian and never shifts the day", () => {
  assert.equal(formatDate("2026-09-01", "mn"), "2026.09.01");
  assert.equal(formatDate("2026-09-01", "en"), "Sep 1, 2026");
});

test("formatMonth spells out Mongolian months", () => {
  assert.equal(formatMonth("2026-09", "mn"), "2026 оны 9-р сар");
  assert.equal(formatMonth("2026-09", "en"), "September 2026");
});
