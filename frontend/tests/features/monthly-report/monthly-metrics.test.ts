import assert from "node:assert/strict";
import { test } from "node:test";
import { toMonthlyReport } from "../../../src/features/monthly-report/monthly-metrics.ts";

const counts = (tickets: number, firstResponseBreached: number) => ({
  tickets,
  firstResponseBreached,
  resolutionBreached: 0,
});

test("toMonthlyReport maps Jira priorities and first-response breaches", () => {
  const report = toMonthlyReport(
    {
      coverage: { firstCapturedAt: "2026-10-01T00:00:00.000Z", lastCapturedAt: "2026-10-02T00:00:00.000Z", capturedDays: 2 },
      firstResponseKnown: 6, firstResponseMissing: 1,
      resolutionKnown: 5, resolutionMissing: 2,
      month: "2026-10",
      snapshots: 9,
      tickets: 7,
      firstResponseBreached: 2,
      resolutionBreached: 1,
      firstResponseBreachRate: 2 / 7,
      resolutionBreachRate: 1 / 7,
      byPriority: { Low: counts(2, 0), Highest: counts(2, 1), Lowest: counts(1, 1), None: counts(2, 0) },
    },
    "2026-10-21T00:00:00Z",
  );
  assert.equal(report.coverage.capturedDays, 2);
  assert.equal(report.coverage.lastCapturedAt, "2026-10-02T00:00:00.000Z");
  assert.equal(report.firstResponseKnown, 6);
  assert.equal(report.firstResponseMissing, 1);
  assert.equal(report.resolutionKnown, 5);
  assert.equal(report.resolutionMissing, 2);
  assert.equal(report.summary.tickets.value, 7);
  assert.equal(report.summary.breaches.value, 2);
  assert.equal(report.summary.compliance.value, 1 - 2 / 7);
  assert.equal(report.summary.tickets.previous, null);
  assert.equal(report.summary.avgFirstResponseMinutes, null);
  assert.deepEqual(
    report.byPriority.map((r) => [r.priority, r.tickets, r.breaches]),
    [
      ["critical", 2, 1],
      ["low", 3, 1],
    ],
  );
  assert.deepEqual(report.team, []);
  assert.deepEqual(report.trend, []);
});

test("toMonthlyReport leaves compliance empty for a month with no tickets", () => {
  const report = toMonthlyReport(
    {
      coverage: { firstCapturedAt: null, lastCapturedAt: null, capturedDays: 0 },
      firstResponseKnown: 0, firstResponseMissing: 0,
      resolutionKnown: 0, resolutionMissing: 0,
      month: "2026-11",
      snapshots: 0,
      tickets: 0,
      firstResponseBreached: 0,
      resolutionBreached: 0,
      firstResponseBreachRate: null,
      resolutionBreachRate: null,
      byPriority: {},
    },
    "2026-11-01T00:00:00Z",
  );
  assert.equal(report.summary.compliance.value, null);
  assert.deepEqual(report.byPriority, []);
});
