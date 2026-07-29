import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateTestCounts,
  formatTerminalSummary,
  parseJestResult,
  parsePlaywrightResult,
} from "./test-summary.mjs";

test("parses Jest pass, fail, skip and suite counts", () => {
  assert.deepEqual(
    parseJestResult({
      numTotalTestSuites: 4,
      numTotalTests: 12,
      numPassedTests: 8,
      numFailedTests: 2,
      numPendingTests: 1,
      numTodoTests: 1,
    }),
    {
      suites: 4,
      total: 12,
      passed: 8,
      failed: 2,
      skipped: 2,
      flaky: 0,
    },
  );
});

test("parses Playwright counts and nested suites", () => {
  assert.deepEqual(
    parsePlaywrightResult({
      stats: {
        expected: 8,
        unexpected: 1,
        skipped: 2,
        flaky: 1,
      },
      suites: [
        {
          specs: [{}],
          suites: [{ specs: [{}, {}] }],
        },
      ],
    }),
    {
      suites: 2,
      total: 12,
      passed: 8,
      failed: 1,
      skipped: 2,
      flaky: 1,
    },
  );
});

test("aggregates only stages that contain test counts", () => {
  assert.deepEqual(
    aggregateTestCounts([
      {
        counts: {
          suites: 2,
          total: 10,
          passed: 9,
          failed: 1,
          skipped: 0,
          flaky: 0,
        },
      },
      { counts: { total: null } },
      {
        counts: {
          suites: 1,
          total: 5,
          passed: 4,
          failed: 0,
          skipped: 1,
          flaky: 0,
        },
      },
    ]),
    {
      suites: 3,
      total: 15,
      passed: 13,
      failed: 1,
      skipped: 1,
      flaky: 0,
    },
  );
});

test("renders a terminal table with counts and overall status", () => {
  const summary = formatTerminalSummary([
    {
      label: "API Unit",
      counts: {
        suites: 2,
        total: 10,
        passed: 9,
        failed: 1,
        skipped: 0,
        flaky: 0,
      },
      durationMs: 1200,
      status: "FAIL",
    },
  ]);

  assert.match(summary, /API Unit/);
  assert.match(summary, /10/);
  assert.match(summary, /FAIL/);
  assert.match(summary, /TOTAL/);
});
