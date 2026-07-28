class LiveSummaryReporter {
  onRunComplete(_contexts, results) {
    const skipped =
      (results.numPendingTests || 0) + (results.numTodoTests || 0);
    const status =
      (results.numFailedTests || 0) === 0 &&
      (results.numRuntimeErrorTestSuites || 0) === 0 &&
      !results.wasInterrupted
        ? "PASS"
        : "FAIL";

    process.stdout.write(
      [
        "",
        "[API TEST SUMMARY]",
        `Suites: ${results.numPassedTestSuites || 0} passed, ${results.numFailedTestSuites || 0} failed, ${results.numTotalTestSuites || 0} total`,
        `Tests:  ${results.numPassedTests || 0} passed, ${results.numFailedTests || 0} failed, ${skipped} skipped, ${results.numTotalTests || 0} total`,
        `Status: ${status}`,
        "",
      ].join("\n"),
    );
  }
}

module.exports = LiveSummaryReporter;
