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
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  APP_ORDER,
  changedFilesBetween,
  detectAffectedApps,
} from "./detect-affected-apps.mjs";
import {
  appsToVerify,
  passedApps,
  readPushCache,
  recordVerifiedApps,
  verifiedAppsForTree,
  writePushCache,
} from "./push-verification-cache.mjs";
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

/** `ci` groups, in run order. `pnpm verify:ci` (no --group) = the full gate. */
export const CI_GROUPS = ["static", "unit", "release"];
/** Opt-in group: needs Postgres/Redis/Elasticsearch/Mailpit on localhost. */
export const CI_OPTIONAL_GROUPS = ["e2e"];

export function parseArguments(argv) {
  const mode = argv[0];
  const options = {
    mode,
    base: undefined,
    head: "HEAD",
    paytr: false,
    tests: false,
    groups: [],
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
    } else if (argument === "--tests") {
      options.tests = true;
    } else if (argument === "--group") {
      const group = argv[index + 1];
      if (![...CI_GROUPS, ...CI_OPTIONAL_GROUPS].includes(group)) {
        throw new Error(
          `Unknown group: ${group} (expected ${[...CI_GROUPS, ...CI_OPTIONAL_GROUPS].join(", ")})`,
        );
      }
      options.groups.push(group);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!["watch", "push", "release", "ci"].includes(mode)) {
    throw new Error(
      "Usage: node scripts/verify-local.mjs <watch|push|release|ci> [--base SHA] [--head SHA] [--tests] [--group static|unit|release|e2e] [--paytr]",
    );
  }
  if (options.groups.length > 0 && mode !== "ci") {
    throw new Error("--group is only valid with the ci mode.");
  }
  if (options.tests && mode !== "push") {
    throw new Error("--tests is only valid with the push mode.");
  }
  if (mode === "ci" && options.groups.length === 0) {
    options.groups = [...CI_GROUPS];
  }

  return options;
}

/**
 * Changed files `jest --findRelatedTests` can map to API specs: TypeScript
 * under apps/api (the jest roots) that still exists at HEAD. Package sources
 * are outside the API's jest roots, so jest cannot relate them anyway.
 */
export function relatedApiTestFiles(files, exists = existsSync) {
  return files
    .filter((file) => /^apps\/api\/.+\.ts$/.test(file))
    .map((file) => join(REPO_ROOT, file))
    .filter((file) => exists(file));
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

/** Shared by every worktree of the clone (`--git-common-dir`, not `--git-dir`). */
function pushCachePath() {
  const commonDirectory = git("rev-parse", "--git-common-dir");
  const absolute = isAbsolute(commonDirectory)
    ? commonDirectory
    : resolve(REPO_ROOT, commonDirectory);
  const reportRoot = join(absolute, "tarodan-test-results");
  mkdirSync(reportRoot, { recursive: true });
  return join(reportRoot, "push-verified-trees.json");
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

/**
 * Local pre-push gate for `development` — typecheck (+ the web/admin API
 * contract script) of the affected apps only, one process at a time. About a
 * minute even when all three apps are affected, and never more than one tsc
 * (~2.5 GB) in memory.
 *
 * Unit tests are NOT part of the hook: the full API suite runs in CI on every
 * development push as an advisory run (Development Tests, ~2 min of jest on a
 * clean runner) and is a required check on PRs to master. Running jest here is
 * what froze 16 GB machines and pushed everyone to --no-verify. `--tests` (manual: `pnpm verify:push
 * --tests`) adds the related API specs and the web/admin unit suites, capped
 * at half the cores.
 */
function buildPushStages(context, apps, { changes, withTests }) {
  const stages = [];
  // Each push stage carries its app so a passing app can be cached per tree.
  const pushFor = (app, ...appStages) =>
    stages.push(...appStages.map((stage) => ({ ...stage, app })));

  if (apps.includes("api")) {
    pushFor(
      "api",
      commandStage("api-types", "API Typecheck", [
        "--filter",
        "@tarodan/api",
        "typecheck",
      ]),
    );
    if (withTests) {
      // Without a base (first push of a branch) there is no diff to relate:
      // run the whole suite, still capped at half the cores.
      const related = changes.fallbackAll
        ? []
        : relatedApiTestFiles(changes.files);
      if (changes.fallbackAll || related.length > 0) {
        pushFor(
          "api",
          jestStage(context, "api-unit", "API Unit (related)", [
            "--maxWorkers=50%",
            "--passWithNoTests",
            ...(changes.fallbackAll ? [] : ["--findRelatedTests", ...related]),
          ]),
        );
      }
    }
  }

  for (const app of ["web", "admin"]) {
    if (!apps.includes(app)) {
      continue;
    }
    const label = app === "web" ? "Web" : "Admin";
    pushFor(
      app,
      commandStage(`${app}-types`, `${label} Typecheck`, [
        "--filter",
        `@tarodan/${app}`,
        "typecheck",
      ]),
      commandStage(`${app}-contract`, `${label} API Contract`, [
        "--filter",
        `@tarodan/${app}`,
        "test:api",
      ]),
    );
    if (withTests) {
      pushFor(
        app,
        commandStage(
          `${app}-unit`,
          `${label} Unit`,
          ["--filter", `@tarodan/${app}`, "test"],
          { env: { NODE_ENV: "test" } },
        ),
      );
    }
  }

  return stages;
}

/**
 * CI gate stages, by group. The groups map 1:1 to the jobs of
 * .github/workflows/verify.yml so CI and `pnpm verify:ci` cannot drift:
 *
 *   static   typecheck + lint (all workspaces) + verification-tool specs +
 *            API contracts + API seed build
 *   unit     the FULL API jest suite + every workspace's vitest suite
 *   release  production build + dependency audit       (master gate only)
 *   e2e      API e2e + full scenarios against local services (opt-in)
 *
 * Development pushes gate the staging deploy on static only and run unit as
 * an advisory workflow; PRs to development run static + unit (nothing
 * required); master PRs and the production release run all three default
 * groups.
 */
function buildCiStages(context, groups = CI_GROUPS) {
  const stages = [];

  if (groups.includes("static")) {
    stages.push(
      commandStage("typecheck", "Workspace Typecheck", ["typecheck"]),
      // Every workspace's `lint` reports without fixing, except the API's,
      // which runs `eslint --fix` for developers: a fixable error would be
      // rewritten on the runner and pass. The API is linted through its
      // non-fixing `lint:ci` instead (a turbo task too, so it is cached).
      commandStage("lint", "Workspace Lint", [
        "exec",
        "turbo",
        "run",
        "lint",
        "--filter=!@tarodan/api",
      ]),
      commandStage("api-lint", "API Lint", [
        "exec",
        "turbo",
        "run",
        "lint:ci",
        "--filter=@tarodan/api",
      ]),
      // node:test specs of these very scripts (affected-app detection, push
      // cache, report parsing) — the pipeline checks its own tooling.
      commandStage("verification-tools", "Verification Tools", [
        "test:verification-tools",
      ]),
      commandStage("contracts", "Web/Admin API Contract", [
        "--filter",
        "@tarodan/web",
        "--filter",
        "@tarodan/admin",
        "test:api",
      ]),
      // Ayrı bir tsconfig, ayrı bir çıktı ağacı: `nest build` bunu KAPSAMAZ.
      // Üretim boot'u derlenmiş seed'leri sabit yollardan çağırdığı için
      // (seed:prod, bootstrap:prod:admin, …) buradaki bir kayma konteyneri
      // MODULE_NOT_FOUND ile crash-loop'a sokar — ve bunu ancak deploy'da
      // görürüz. Staging deploy'u bu kapıyı beklediği için o tur buraya çekilir.
      commandStage("api-seed-build", "API Seed Build", [
        "--filter",
        "@tarodan/api",
        "build:seed",
      ]),
    );
  }

  if (groups.includes("unit")) {
    stages.push(
      jestStage(context, "api-unit", "API Unit", []),
      // Every non-API workspace with a `test` script (web, admin,
      // listing-form, auth, logger), through turbo so the `^build`
      // dependencies (types/i18n/logger dist) exist on a clean runner.
      // NODE_ENV=test: under "production" react resolves to its production
      // build, where `act()` throws and every component spec fails.
      commandStage(
        "workspace-unit",
        "Workspace Unit (vitest)",
        ["exec", "turbo", "run", "test", "--filter=!@tarodan/api"],
        { env: { NODE_ENV: "test" } },
      ),
    );
  }

  if (groups.includes("release")) {
    stages.push(
      commandStage("build", "Production Build", ["build"]),
      commandStage("audit", "Dependency Audit", ["audit:prod"]),
    );
  }

  if (groups.includes("e2e")) {
    stages.push(
      // The e2e jest config maps only @tarodan/types to source; i18n/logger
      // resolve to their dist, which a clean runner does not have yet.
      commandStage("api-deps-build", "API Dependency Build", [
        "exec",
        "turbo",
        "run",
        "build",
        "--filter=@tarodan/api^...",
      ]),
      ...buildE2eStages(context, ["api-deps-build"]),
    );
  }

  return stages;
}

/** API e2e + full scenarios against an already running test database. */
function buildE2eStages(context, dependsOn = []) {
  return [
    commandStage(
      "test-migrations",
      "Test Database Migrations",
      ["--filter", "@tarodan/api", "test:e2e:setup"],
      { dependsOn },
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
  ];
}

/**
 * Optional local release rehearsal (`pnpm verify:release:local`): the full CI
 * gate plus the parts CI does not run yet — local Docker infra, API e2e, full
 * scenarios and the Playwright suite. Not required for a master push any more;
 * master is gated by the PR checks and the Release Production workflow.
 */
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
    ...buildE2eStages(context, ["test-db"]),
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
  let apps = [...APP_ORDER];
  let stages;
  let continueOnFailure = false;

  let pushTree;
  if (options.mode === "push") {
    const base = resolveBase(options.base);
    const changes = changedFilesBetween(base, options.head);
    apps = changes.fallbackAll
      ? [...APP_ORDER]
      : detectAffectedApps(changes.files);
    console.log(`Affected applications: ${apps.join(", ") || "none"}`);
    // The stages run on the working tree, so the cache is only trusted when
    // that IS the pushed tree: clean worktree and HEAD's tree == head's tree.
    const headTree = git("rev-parse", `${options.head}^{tree}`);
    const testedTree = git("status", "--porcelain")
      ? undefined
      : git("rev-parse", "HEAD^{tree}");
    pushTree = testedTree === headTree ? headTree : undefined;
    // A cached pass is typecheck-only, so a `--tests` run never trusts it.
    const alreadyVerified =
      !pushTree || options.tests
        ? []
        : verifiedAppsForTree(readPushCache(pushCachePath()), pushTree);
    const pending = appsToVerify(apps, alreadyVerified);
    if (pending.length < apps.length) {
      const skipped = apps.filter((app) => !pending.includes(app));
      console.log(
        `Already verified for tree ${headTree.slice(0, 12)}: ${skipped.join(", ")} (skipped)`,
      );
    }
    stages = buildPushStages(context, pending, {
      changes,
      withTests: options.tests,
    });
  } else if (options.mode === "release") {
    stages = buildReleaseStages(context, options.paytr);
    continueOnFailure = true;
  } else {
    // CI reports every failing stage of its group in one run.
    stages = buildCiStages(context, options.groups);
    continueOnFailure = true;
  }

  const results = await runStages(stages, { continueOnFailure });
  if (pushTree) {
    const verified = passedApps(apps, results);
    if (verified.length > 0) {
      const cachePath = pushCachePath();
      writePushCache(
        cachePath,
        recordVerifiedApps(
          readPushCache(cachePath),
          pushTree,
          verified,
          new Date().toISOString(),
        ),
      );
    }
  }
  console.log(`\n${formatTerminalSummary(results)}\n`);
  const { report, reportPath } = writeRunReport(
    context,
    options.mode,
    apps,
    results,
    startedAt,
  );
  console.log(`Report: ${reportPath}`);

  if (options.mode === "push" && !options.tests && report.status === "PASS") {
    console.log(
      "Unit tests run in CI after the push (Development Tests, advisory) and are required on PRs to master. " +
        "Run them locally first with: pnpm verify:push --tests",
    );
  }

  if (report.status !== "PASS") {
    process.exitCode = 1;
  }
}

const isDirectExecution =
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isDirectExecution) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
