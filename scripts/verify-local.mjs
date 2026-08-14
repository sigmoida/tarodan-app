#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  APP_ORDER,
  changedFilesBetween,
  detectAffectedApps,
} from "./detect-affected-apps.mjs";
import {
  emptyCounts,
  formatMarkdownSummary,
  formatTerminalSummary,
  parseJestResult,
  parsePlaywrightResult,
} from "./test-summary.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const API_ROOT = join(REPO_ROOT, "apps/api");
const WEB_ROOT = join(REPO_ROOT, "apps/web");
const REPORTER_PATH = join(SCRIPT_DIR, "jest-live-summary-reporter.cjs");

function parseArguments(argv) {
  const mode = argv[0];
  const options = {
    mode,
    base: undefined,
    head: "HEAD",
    paytr: false,
  };

  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--base") {
      options.base = argv[index + 1];
      index += 1;
    } else if (argument === "--head") {
      options.head = argv[index + 1];
      index += 1;
    } else if (argument === "--paytr") {
      options.paytr = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!["watch", "push", "release", "ci"].includes(mode)) {
    throw new Error(
      "Usage: node scripts/verify-local.mjs <watch|push|release|ci> [--base SHA] [--head SHA] [--paytr]",
    );
  }

  return options;
}

function git(...args) {
  return execFileSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function resolveGitDirectory() {
  const gitDirectory = git("rev-parse", "--git-dir");
  return isAbsolute(gitDirectory)
    ? gitDirectory
    : resolve(REPO_ROOT, gitDirectory);
}

function resolveBase(explicitBase) {
  if (explicitBase) {
    return explicitBase;
  }

  try {
    return git("rev-parse", "@{upstream}");
  } catch {
    try {
      return git("rev-parse", "HEAD^");
    } catch {
      return undefined;
    }
  }
}

function createRunDirectory(mode) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportRoot = join(resolveGitDirectory(), "tarodan-test-results");
  const runDirectory = join(reportRoot, `${timestamp}-${mode}`);
  mkdirSync(runDirectory, { recursive: true });
  return { reportRoot, runDirectory };
}

function releaseMarkerPath(context) {
  return join(context.reportRoot, "release-verification.json");
}

function writeReleaseMarker(context, marker) {
  writeFileSync(
    releaseMarkerPath(context),
    `${JSON.stringify(marker, null, 2)}\n`,
  );
}

function testReportPath(context, stage, extension = "json") {
  return join(context.runDirectory, `${stage.id}.${extension}`);
}

function commandStage(id, label, args, options = {}) {
  return {
    id,
    label,
    command: options.command ?? "pnpm",
    args,
    cwd: options.cwd ?? REPO_ROOT,
    env: options.env ?? {},
    report: options.report,
    dependsOn: options.dependsOn ?? [],
  };
}

function jestStage(context, id, label, jestArgs, options = {}) {
  const outputFile = testReportPath(context, { id });
  return commandStage(
    id,
    label,
    [
      "--filter",
      "@tarodan/api",
      "exec",
      "jest",
      ...jestArgs,
      "--json",
      `--outputFile=${outputFile}`,
    ],
    {
      ...options,
      report: { type: "jest", path: outputFile },
    },
  );
}

function playwrightStage(context, id, label, options = {}) {
  const outputFile = testReportPath(context, { id });
  return commandStage(
    id,
    label,
    [
      "--filter",
      "@tarodan/web",
      "exec",
      "playwright",
      "test",
      "--reporter=list,json",
    ],
    {
      ...options,
      env: {
        E2E_LITE: "1",
        PLAYWRIGHT_JSON_OUTPUT_NAME: outputFile,
        ...options.env,
      },
      report: { type: "playwright", path: outputFile },
    },
  );
}

function buildPushStages(context, apps) {
  const stages = [];

  if (apps.includes("api")) {
    stages.push(
      commandStage("api-types", "API Typecheck", [
        "--filter",
        "@tarodan/api",
        "typecheck",
      ]),
      jestStage(context, "api-unit", "API Unit", []),
      commandStage("api-build", "API Build", [
        "--filter",
        "@tarodan/api...",
        "build",
      ]),
    );
  }

  if (apps.includes("web")) {
    stages.push(
      commandStage("web-types", "Web Typecheck", [
        "--filter",
        "@tarodan/web",
        "typecheck",
      ]),
      commandStage("web-contract", "Web API Contract", [
        "--filter",
        "@tarodan/web",
        "test:api",
      ]),
      commandStage("web-build", "Web Build", [
        "--filter",
        "@tarodan/web...",
        "build",
      ]),
    );
  }

  if (apps.includes("admin")) {
    stages.push(
      commandStage("admin-types", "Admin Typecheck", [
        "--filter",
        "@tarodan/admin",
        "typecheck",
      ]),
      commandStage("admin-contract", "Admin API Contract", [
        "--filter",
        "@tarodan/admin",
        "test:api",
      ]),
      commandStage("admin-unit", "Admin Unit", [
        "--filter",
        "@tarodan/admin",
        "test",
      ]),
      commandStage("admin-build", "Admin Build", [
        "--filter",
        "@tarodan/admin...",
        "build",
      ]),
    );
  }

  return stages;
}

function buildCiStages(context) {
  return [
    commandStage("typecheck", "Workspace Typecheck", ["typecheck"]),
    // @tarodan/web excluded: pre-existing ESLint parsing error in
    // apps/web/src/lib/userExperiencePolicy.d.mts, unrelated to any given
    // change — same exclusion as .github/workflows/pr-checks.yml.
    commandStage("lint", "Workspace Lint", [
      "exec",
      "turbo",
      "run",
      "lint",
      "--filter=!@tarodan/web",
    ]),
    jestStage(context, "api-unit", "API Unit", []),
    commandStage("build", "Production Build", ["build"]),
    commandStage("audit", "Dependency Audit", ["audit:prod"]),
  ];
}

function buildReleaseStages(context, paytr) {
  const stages = [
    ...buildCiStages(context),
    commandStage("local-env", "Local Test Environment", ["dev:env"]),
    commandStage("local-infra", "Local Test Infrastructure", ["dev:up"], {
      dependsOn: ["local-env"],
    }),
    commandStage(
      "test-db",
      "Local Test Database",
      [join(SCRIPT_DIR, "prepare-local-test-db.mjs")],
      {
        command: process.execPath,
        dependsOn: ["local-infra"],
      },
    ),
    commandStage(
      "test-migrations",
      "Test Database Migrations",
      ["--filter", "@tarodan/api", "test:e2e:setup"],
      { dependsOn: ["test-db"] },
    ),
    jestStage(
      context,
      "api-e2e",
      "API E2E",
      [
        "--config",
        "./test/jest-e2e.json",
        "--runInBand",
        "--testPathIgnorePatterns=/node_modules/",
        "--testPathIgnorePatterns=test/e2e/scenarios/",
      ],
      {
        dependsOn: ["test-migrations"],
      },
    ),
    jestStage(
      context,
      "full-scenarios",
      "Full Scenarios",
      [
        "--config",
        "./test/jest-e2e.json",
        "--runInBand",
        "--testPathPattern",
        "test/e2e/scenarios/",
      ],
      {
        dependsOn: ["test-migrations"],
      },
    ),
    playwrightStage(context, "web-e2e", "Web Playwright", {
      dependsOn: ["local-infra"],
    }),
  ];

  if (paytr) {
    stages.push(
      jestStage(context, "paytr-integration", "PayTR Integration", [
        "--config",
        "./test/jest-integration.json",
        "--runInBand",
      ]),
    );
  }

  return stages;
}

function readStageCounts(report) {
  if (!report || !existsSync(report.path)) {
    return emptyCounts();
  }

  try {
    const result = JSON.parse(readFileSync(report.path, "utf8"));
    return report.type === "playwright"
      ? parsePlaywrightResult(result)
      : parseJestResult(result);
  } catch {
    return emptyCounts();
  }
}

function printStageResult(stage) {
  const counts = stage.counts;
  const testDetails = Number.isFinite(counts.total)
    ? ` | suites=${counts.suites} total=${counts.total} passed=${counts.passed} failed=${counts.failed} skipped=${counts.skipped} flaky=${counts.flaky}`
    : "";
  const duration = `${Math.round(stage.durationMs / 1000)}s`;
  console.log(
    `\n[RESULT] ${stage.label}: ${stage.status}${testDetails} | duration=${duration}\n`,
  );
}

function runProcess(stage) {
  return new Promise((resolvePromise) => {
    const child = spawn(stage.command, stage.args, {
      cwd: stage.cwd,
      env: { ...process.env, ...stage.env },
      stdio: ["inherit", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk) => process.stdout.write(chunk));
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    child.on("error", () => resolvePromise(1));
    child.on("close", (code) => resolvePromise(code ?? 1));
  });
}

async function runStages(stages, options = {}) {
  const results = [];
  const resultById = new Map();
  let stopRemaining = false;

  for (const stage of stages) {
    const dependencyFailed = stage.dependsOn.some(
      (dependency) => resultById.get(dependency)?.status !== "PASS",
    );

    if (stopRemaining || dependencyFailed) {
      const result = {
        ...stage,
        status: "NOT RUN",
        durationMs: 0,
        counts: emptyCounts(),
      };
      results.push(result);
      resultById.set(stage.id, result);
      continue;
    }

    console.log(
      `\n${"=".repeat(72)}\n[RUN] ${stage.label}\n${"=".repeat(72)}\n`,
    );
    const startedAt = Date.now();
    const exitCode = await runProcess(stage);
    const result = {
      ...stage,
      status: exitCode === 0 ? "PASS" : "FAIL",
      durationMs: Date.now() - startedAt,
      counts: readStageCounts(stage.report),
    };

    results.push(result);
    resultById.set(stage.id, result);
    printStageResult(result);

    if (result.status === "FAIL" && !options.continueOnFailure) {
      stopRemaining = true;
    }
  }

  return results;
}

function writeRunReport(context, mode, affectedApps, stages, startedAt) {
  const finishedAt = new Date();
  const status = stages.some((stage) => stage.status === "FAIL")
    ? "FAIL"
    : stages.some((stage) => stage.status === "NOT RUN")
      ? "INCOMPLETE"
      : "PASS";
  const report = {
    mode,
    status,
    commit: git("rev-parse", "HEAD"),
    tree: git("rev-parse", "HEAD^{tree}"),
    affectedApps,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    stages: stages.map((stage) => ({
      id: stage.id,
      label: stage.label,
      status: stage.status,
      durationMs: stage.durationMs,
      counts: stage.counts,
    })),
  };
  const reportPath = join(context.runDirectory, "summary.json");
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(
    join(context.runDirectory, "summary.txt"),
    `${formatTerminalSummary(stages)}\n`,
  );
  writeFileSync(
    join(context.reportRoot, `latest-${mode}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  if (mode === "release") {
    writeReleaseMarker(context, {
      status,
      commit: report.commit,
      tree: report.tree,
      verifiedAt: report.finishedAt,
      reportPath,
    });
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      formatMarkdownSummary(stages),
    );
  }

  return { report, reportPath };
}

function prefixStream(stream, prefix, destination) {
  let buffered = "";

  stream.on("data", (chunk) => {
    buffered += chunk.toString();
    const lines = buffered.split(/\r?\n/);
    buffered = lines.pop() ?? "";
    for (const line of lines) {
      destination.write(`[${prefix}] ${line}\n`);
    }
  });

  stream.on("end", () => {
    if (buffered) {
      destination.write(`[${prefix}] ${buffered}\n`);
    }
  });
}

async function runWatchers() {
  const watchers = [
    {
      prefix: "API TEST",
      args: [
        "--filter",
        "@tarodan/api",
        "exec",
        "jest",
        "--watch",
        "--reporters=default",
        `--reporters=${REPORTER_PATH}`,
      ],
    },
    {
      prefix: "API TYPES",
      args: [
        "--filter",
        "@tarodan/api",
        "exec",
        "tsc",
        "--noEmit",
        "-p",
        "tsconfig.typecheck.json",
        "--watch",
        "--preserveWatchOutput",
      ],
    },
    {
      prefix: "WEB TYPES",
      args: [
        "--filter",
        "@tarodan/web",
        "exec",
        "tsc",
        "--noEmit",
        "--watch",
        "--preserveWatchOutput",
      ],
    },
    {
      prefix: "ADMIN TYPES",
      args: [
        "--filter",
        "@tarodan/admin",
        "exec",
        "tsc",
        "--noEmit",
        "--watch",
        "--preserveWatchOutput",
      ],
    },
  ];
  const children = [];
  let shuttingDown = false;

  const stopAll = (exitCode = 0) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    for (const child of children) {
      child.kill("SIGTERM");
    }
    setTimeout(() => process.exit(exitCode), 100).unref();
  };

  process.on("SIGINT", () => stopAll(0));
  process.on("SIGTERM", () => stopAll(0));

  console.log("Starting live local verification. Press Ctrl+C to stop.\n");
  for (const watcher of watchers) {
    const child = spawn("pnpm", watcher.args, {
      cwd: REPO_ROOT,
      env: process.env,
      stdio: ["inherit", "pipe", "pipe"],
    });
    children.push(child);
    prefixStream(child.stdout, watcher.prefix, process.stdout);
    prefixStream(child.stderr, watcher.prefix, process.stderr);
    child.on("error", () => stopAll(1));
    child.on("close", (code) => {
      if (!shuttingDown && code !== 0) {
        console.error(`[${watcher.prefix}] exited with status ${code}`);
        stopAll(1);
      }
    });
  }

  await new Promise(() => {});
}

async function run() {
  const options = parseArguments(process.argv.slice(2));
  if (options.mode === "watch") {
    await runWatchers();
    return;
  }
  if (options.mode === "release" && git("status", "--porcelain")) {
    throw new Error(
      "Release verification requires a clean worktree. Commit or remove local changes first.",
    );
  }

  const startedAt = new Date();
  const context = createRunDirectory(options.mode);
  if (options.mode === "release") {
    writeReleaseMarker(context, {
      status: "IN_PROGRESS",
      commit: git("rev-parse", "HEAD"),
      tree: git("rev-parse", "HEAD^{tree}"),
      startedAt: startedAt.toISOString(),
    });
  }
  let apps = [...APP_ORDER];
  let stages;
  let continueOnFailure = false;

  if (options.mode === "push") {
    const base = resolveBase(options.base);
    const changes = changedFilesBetween(base, options.head);
    apps = changes.fallbackAll
      ? [...APP_ORDER]
      : detectAffectedApps(changes.files);
    console.log(`Affected applications: ${apps.join(", ") || "none"}`);
    stages = buildPushStages(context, apps);
  } else if (options.mode === "release") {
    stages = buildReleaseStages(context, options.paytr);
    continueOnFailure = true;
  } else {
    stages = buildCiStages(context);
  }

  const results = await runStages(stages, { continueOnFailure });
  console.log(`\n${formatTerminalSummary(results)}\n`);
  const { report, reportPath } = writeRunReport(
    context,
    options.mode,
    apps,
    results,
    startedAt,
  );
  console.log(`Report: ${reportPath}`);

  if (report.status !== "PASS") {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
