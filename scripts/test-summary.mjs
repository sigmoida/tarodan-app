const EMPTY_COUNTS = {
  suites: null,
  total: null,
  passed: null,
  failed: null,
  skipped: null,
  flaky: null,
};

function numberOrZero(value) {
  return Number.isFinite(value) ? Number(value) : 0;
}

export function parseJestResult(result) {
  const skipped =
    numberOrZero(result.numPendingTests) + numberOrZero(result.numTodoTests);

  return {
    suites: numberOrZero(result.numTotalTestSuites),
    total: numberOrZero(result.numTotalTests),
    passed: numberOrZero(result.numPassedTests),
    failed: numberOrZero(result.numFailedTests),
    skipped,
    flaky: 0,
  };
}

function countPlaywrightSuites(suites = []) {
  let count = 0;

  for (const suite of suites) {
    if ((suite.specs?.length ?? 0) > 0) {
      count += 1;
    }
    count += countPlaywrightSuites(suite.suites);
  }

  return count;
}

export function parsePlaywrightResult(result) {
  const stats = result.stats ?? {};
  const passed = numberOrZero(stats.expected);
  const failed = numberOrZero(stats.unexpected);
  const skipped = numberOrZero(stats.skipped);
  const flaky = numberOrZero(stats.flaky);

  return {
    suites: countPlaywrightSuites(result.suites),
    total: passed + failed + skipped + flaky,
    passed,
    failed,
    skipped,
    flaky,
  };
}

export function emptyCounts() {
  return { ...EMPTY_COUNTS };
}

export function aggregateTestCounts(stages) {
  const totals = {
    suites: 0,
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    flaky: 0,
  };

  for (const stage of stages) {
    if (!Number.isFinite(stage.counts?.total)) {
      continue;
    }

    for (const key of Object.keys(totals)) {
      totals[key] += numberOrZero(stage.counts[key]);
    }
  }

  return totals;
}

function displayCount(value) {
  return Number.isFinite(value) ? String(value) : "-";
}

function displayDuration(durationMs) {
  if (!Number.isFinite(durationMs)) {
    return "-";
  }

  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function pad(value, width, alignRight = false) {
  const text = String(value);
  return alignRight ? text.padStart(width) : text.padEnd(width);
}

export function formatTerminalSummary(stages) {
  const headers = [
    ["Stage", 28, false],
    ["Suites", 7, true],
    ["Total", 7, true],
    ["Passed", 7, true],
    ["Failed", 7, true],
    ["Skipped", 7, true],
    ["Flaky", 6, true],
    ["Duration", 9, true],
    ["Status", 8, false],
  ];

  const row = (values) =>
    values
      .map((value, index) => pad(value, headers[index][1], headers[index][2]))
      .join("  ")
      .trimEnd();

  const lines = [
    "TEST SUMMARY",
    "",
    row(headers.map(([label]) => label)),
    "-".repeat(105),
  ];

  for (const stage of stages) {
    lines.push(
      row([
        stage.label,
        displayCount(stage.counts?.suites),
        displayCount(stage.counts?.total),
        displayCount(stage.counts?.passed),
        displayCount(stage.counts?.failed),
        displayCount(stage.counts?.skipped),
        displayCount(stage.counts?.flaky),
        displayDuration(stage.durationMs),
        stage.status,
      ]),
    );
  }

  const totals = aggregateTestCounts(stages);
  const durationMs = stages.reduce(
    (sum, stage) => sum + numberOrZero(stage.durationMs),
    0,
  );
  const status = stages.some((stage) => stage.status === "FAIL")
    ? "FAIL"
    : stages.some((stage) => stage.status === "NOT RUN")
      ? "INCOMPLETE"
      : "PASS";

  lines.push("-".repeat(105));
  lines.push(
    row([
      "TOTAL",
      totals.suites,
      totals.total,
      totals.passed,
      totals.failed,
      totals.skipped,
      totals.flaky,
      displayDuration(durationMs),
      status,
    ]),
  );

  return lines.join("\n");
}

export function formatMarkdownSummary(stages) {
  const lines = [
    "## Test Summary",
    "",
    "| Stage | Suites | Total | Passed | Failed | Skipped | Flaky | Duration | Status |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
  ];

  for (const stage of stages) {
    lines.push(
      `| ${stage.label} | ${displayCount(stage.counts?.suites)} | ${displayCount(stage.counts?.total)} | ${displayCount(stage.counts?.passed)} | ${displayCount(stage.counts?.failed)} | ${displayCount(stage.counts?.skipped)} | ${displayCount(stage.counts?.flaky)} | ${displayDuration(stage.durationMs)} | ${stage.status} |`,
    );
  }

  const totals = aggregateTestCounts(stages);
  const durationMs = stages.reduce(
    (sum, stage) => sum + numberOrZero(stage.durationMs),
    0,
  );
  const status = stages.some((stage) => stage.status === "FAIL")
    ? "FAIL"
    : stages.some((stage) => stage.status === "NOT RUN")
      ? "INCOMPLETE"
      : "PASS";

  lines.push(
    `| **TOTAL** | **${totals.suites}** | **${totals.total}** | **${totals.passed}** | **${totals.failed}** | **${totals.skipped}** | **${totals.flaky}** | **${displayDuration(durationMs)}** | **${status}** |`,
  );

  return `${lines.join("\n")}\n`;
}
